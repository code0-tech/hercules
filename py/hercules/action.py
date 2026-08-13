"""The :class:`Action` — the SDK entry point (port of ``src/action.ts``)."""
from __future__ import annotations

import asyncio
import inspect
import os
import uuid
from dataclasses import replace
from typing import Callable, Dict, List, Optional

from hercules._metadata import get_metadata
from tucana.generated.aquila import action_pb2
from hercules._tucana.helpers import PlainValue, construct_value, to_allowed_value
from hercules.actions import actions as _packet_handlers
from hercules.events import CodeZeroEvent
from hercules.internal.connection import create_connection
from hercules.internal.module_builder import ModuleBuildData, build_module
from hercules.manager.config import ConfigManager
from hercules.manager.datatype import DataTypeManager
from hercules.manager.event import EventManager
from hercules.manager.flow import FlowManager
from hercules.manager.function import FunctionManager
from hercules.manager.runtime_event import RuntimeEventManager
from hercules.manager.runtime_function import RuntimeFunctionManager
from hercules.map.datatype import data_type_map
from hercules.map.event import event_map
from hercules.map.function import function_map
from hercules.map.runtime_event import runtime_event_map
from hercules.map.runtime_function import runtime_function_map
from hercules.models.event import EventModel
from hercules.models.function import FunctionProps
from hercules.types import ConfigurationDefinition, RuntimeError, Translation

# Registry of actions constructed while exporting, so the CLI can find them.
_REGISTERED_ACTIONS: List["Action"] = []


def is_export_mode() -> bool:
    return os.environ.get("HERCULES_EXPORT") == "1"


def registered_actions() -> List["Action"]:
    return list(_REGISTERED_ACTIONS)


class EventEmitter:
    """A minimal Node-style event emitter."""

    def __init__(self) -> None:
        self._listeners: Dict[str, List[Callable]] = {}

    def on(self, event, listener: Callable) -> "EventEmitter":
        self._listeners.setdefault(str(event), []).append(listener)
        return self

    def once(self, event, listener: Callable) -> "EventEmitter":
        def wrapper(*args):
            self.off(event, wrapper)
            return listener(*args)

        return self.on(event, wrapper)

    def off(self, event, listener: Callable) -> "EventEmitter":
        listeners = self._listeners.get(str(event))
        if listeners and listener in listeners:
            listeners.remove(listener)
        return self

    def emit(self, event, *args) -> bool:
        listeners = list(self._listeners.get(str(event), []))
        for listener in listeners:
            result = listener(*args)
            if inspect.isawaitable(result):
                asyncio.ensure_future(result)
        return bool(listeners)


class Action(EventEmitter):
    def __init__(
        self,
        identifier: str,
        version: str,
        aquila_url: Optional[str],
        author: str,
        icon: str,
        documentation: str,
        name: List[Translation],
        configuration_definitions: Optional[List[ConfigurationDefinition]] = None,
    ) -> None:
        super().__init__()
        self._identifier = identifier
        self._version = version
        self._aquila_url = aquila_url
        self._author = author
        self._icon = icon
        self._documentation = documentation
        self._name = name
        self._configuration_definitions = [
            c if isinstance(c, ConfigurationDefinition) else ConfigurationDefinition(**c)
            for c in (configuration_definitions or [])
        ]

        self._channel = None
        self._stream = None
        self._actions = {a.packet_type: a.handle for a in _packet_handlers}
        # Pending sub flow / flow execution requests awaiting a response, keyed
        # by execution identifier. A queue matches responses FIFO because a sub
        # flow can be executed repeatedly under the same execution identifier.
        self._pending_executions: Dict[str, List[asyncio.Future]] = {}

        self.configs = ConfigManager()
        self.flows = FlowManager()
        self.functions = FunctionManager()
        self.runtime_functions = RuntimeFunctionManager()
        self.data_types = DataTypeManager()
        self.events = EventManager()
        self.runtime_events = RuntimeEventManager()

        if is_export_mode():
            _REGISTERED_ACTIONS.append(self)

    @property
    def identifier(self) -> str:
        return self._identifier

    @property
    def version(self) -> str:
        return self._version

    @property
    def stream(self):
        return self._stream

    # --- registration ---------------------------------------------------------
    def register_function(self, klass: type) -> None:
        definition = function_map(klass)
        self.functions.set(definition.runtime_name, definition)

    def register_runtime_function(self, klass: type) -> None:
        omit_definition = get_metadata("hercules:omit_function_definition", klass) or False
        definition = runtime_function_map(klass)
        self.runtime_functions.set(definition.runtime_name, definition)
        if not omit_definition:
            self.functions.set(
                definition.runtime_name,
                FunctionProps(
                    runtime_definition_name=definition.runtime_name,
                    runtime_name=definition.runtime_name,
                    signature=definition.signature,
                    throws_error=definition.throws_error,
                    name=definition.name,
                    description=definition.description,
                    documentation=definition.documentation,
                    deprecation_message=definition.deprecation_message,
                    display_message=definition.display_message,
                    alias=definition.alias,
                    display_icon=definition.display_icon,
                    design=definition.design,
                    parameters=[
                        replace(p, runtime_definition_name=p.runtime_name)
                        for p in (definition.parameters or [])
                    ],
                ),
            )

    def register_data_type_class(self, klass: type) -> None:
        definition = data_type_map(klass)
        self.data_types.set(definition.identifier, definition)

    def register_event_class(self, klass: type) -> None:
        definition = event_map(klass)
        self.events.set(definition.identifier, definition)

    def register_runtime_event_class(self, klass: type) -> None:
        omit_definition = get_metadata("hercules:omit_event_definition", klass) or False
        definition = runtime_event_map(klass)
        self.runtime_events.set(definition.identifier, definition)
        if not omit_definition:
            self.events.set(
                definition.identifier,
                EventModel(
                    identifier=definition.identifier,
                    signature=definition.signature,
                    settings=definition.settings,
                    editable=definition.editable,
                    name=definition.name,
                    description=definition.description,
                    documentation=definition.documentation,
                    display_message=definition.display_message,
                    alias=definition.alias,
                    display_icon=definition.display_icon,
                    runtime_identifier=definition.identifier,
                ),
            )

    # --- runtime dispatch -----------------------------------------------------
    async def send(self, request) -> None:
        if self._stream is None:
            raise RuntimeError("STREAM_NOT_CONNECTED", "Not connected. Call connect() first.")
        await self._stream.write(request)

    async def fire(self, event_class: type, project_id: int, payload: PlainValue) -> None:
        if self._stream is None:
            raise Exception("Not connected. Call connect() first.")
        event_type = get_metadata("hercules:identifier", event_class)
        if not event_type:
            raise Exception(f"{event_class.__name__} is missing an @Identifier decorator.")
        request = action_pb2.ActionTransferRequest(
            event=action_pb2.ActionEvent(
                project_id=int(project_id),
                event_type=event_type,
                payload=construct_value(payload if payload is not None else None),
            )
        )
        await self.send(request)
        self.emit(event_type, project_id, payload)
        self.emit(CodeZeroEvent.stream_message_sent, request)

    async def execute_sub_flow(self, sub_flow, *params: PlainValue) -> PlainValue:
        if self._stream is None:
            raise Exception("Not connected. Call connect() first.")
        execution_identifier = sub_flow.execution_identifier
        result = self._await_execution_response(execution_identifier)
        request = action_pb2.ActionTransferRequest(
            sub_flow_execution=action_pb2.ActionSubFlowExecutionRequest(
                execution_identifier=execution_identifier,
                parameters=[
                    construct_value(p if p is not None else None) for p in params
                ],
            )
        )
        await self.send(request)
        self.emit(CodeZeroEvent.stream_message_sent, request)
        return await result

    async def execute_flow(self, flow_id, payload: Optional[PlainValue] = None) -> PlainValue:
        if self._stream is None:
            raise Exception("Not connected. Call connect() first.")
        execution_identifier = str(uuid.uuid4())
        result = self._await_execution_response(execution_identifier)
        request = action_pb2.ActionTransferRequest(
            flow_execution=action_pb2.ActionFlowExecutionRequest(
                execution_identifier=execution_identifier,
                flow_id=str(flow_id),
                payload=construct_value(payload if payload is not None else None),
            )
        )
        await self.send(request)
        self.emit(CodeZeroEvent.stream_message_sent, request)
        return await result

    def _await_execution_response(self, execution_identifier: str) -> asyncio.Future:
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending_executions.setdefault(execution_identifier, []).append(future)
        return future

    def resolve_execution_response(self, execution_identifier: str, response) -> None:
        queue = self._pending_executions.get(execution_identifier)
        pending = queue.pop(0) if queue else None
        if queue is not None and len(queue) == 0:
            del self._pending_executions[execution_identifier]
        if pending is None:
            self.emit(
                CodeZeroEvent.error,
                Exception(
                    f"Received execution response for unknown execution identifier: "
                    f"{execution_identifier}"
                ),
            )
            return
        which = response.WhichOneof("result")
        if which == "success":
            pending.set_result(to_allowed_value(response.success))
        elif which == "failure":
            pending.set_exception(RuntimeError(response.failure.code, response.failure.message))
        else:
            pending.set_exception(Exception("Received execution response with no result"))

    async def connect(
        self,
        auth_token: str,
        aquila_url: Optional[str] = None,
        grpc_options: Optional[list] = None,
    ) -> None:
        if is_export_mode():
            return
        url = aquila_url or self._aquila_url
        if not url:
            raise Exception("aquila_url must be provided in the constructor or connect()")

        try:
            channel, stream = await create_connection(
                self.build_module(), auth_token, url, grpc_options
            )
            self._channel = channel
            self._stream = stream
        except Exception as err:  # noqa: BLE001
            self.emit(CodeZeroEvent.error, err)
            raise

        self.emit(CodeZeroEvent.connected, self)
        await self._process_stream()

    async def _process_stream(self) -> None:
        async for message in self._stream:
            self.emit(CodeZeroEvent.stream_message_received, message)
            which = message.WhichOneof("data")
            if which is None:
                self.emit(
                    CodeZeroEvent.error,
                    Exception("Received unknown message type from stream"),
                )
                continue
            handler = self._actions.get(which)
            if handler is not None:
                handler(self, getattr(message, which))

    def build_module(self):
        return build_module(
            ModuleBuildData(
                identifier=self._identifier,
                version=self._version,
                author=self._author,
                icon=self._icon,
                documentation=self._documentation,
                name=self._name,
                configuration_definitions=self._configuration_definitions,
                data_types=self.data_types.values(),
                events=self.events.values(),
                runtime_events=self.runtime_events.values(),
                functions=self.functions.values(),
                runtime_functions=self.runtime_functions.values(),
            )
        )
