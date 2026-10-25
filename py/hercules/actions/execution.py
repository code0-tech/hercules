"""Execution request handler (port of ``src/actions/Execution.ts``)."""
from __future__ import annotations

import asyncio
import inspect
import time
from dataclasses import dataclass
from typing import Callable, Optional

from hercules._tucana.helpers import construct_value
from tucana.generated.aquila import action_pb2
from tucana.generated.shared import errors_pb2, execution_result_pb2
from hercules.events import CodeZeroEvent
from hercules.internal.literal import resolve_node_value
from hercules.internal.sub_flow_function import (
    as_sub_flow_function_definition,
    build_sub_flow_function_result,
)
from hercules.types import ProjectConfiguration, RuntimeError

packet_type = "execution"


@dataclass
class _ExecutionTarget:
    """A function an execution request may address.

    Either a registered runtime function or a sub flow function returned by one.
    ``parameter_count`` is ``None`` for a sub flow function, which has no definition
    declaring its parameters, so every parameter of the request is passed through.
    """

    handler: Callable[..., object]
    parameter_count: Optional[int] = None


def _now_micros() -> int:
    return time.time_ns() // 1000


def _resolve_target(action, identifier: str) -> Optional[_ExecutionTarget]:
    func = action.runtime_functions.get(identifier)
    if func is not None:
        return _ExecutionTarget(func.handler, len(func.parameters or []))

    sub_flow_function = action.sub_flow_functions.get(identifier)
    if sub_flow_function is not None:
        return _ExecutionTarget(sub_flow_function.run)

    return None


def _build_params(action, execution, target: _ExecutionTarget):
    count = (
        target.parameter_count
        if target.parameter_count is not None
        else len(execution.parameters)
    )
    params = []
    for index in range(count):
        field = execution.parameters[index] if index < len(execution.parameters) else None
        params.append(resolve_node_value(action, field))
    return params


def _wants_context(handler, param_count: int) -> bool:
    try:
        sig = inspect.signature(handler)
    except (TypeError, ValueError):
        return False
    positional = [
        p
        for p in sig.parameters.values()
        if p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD)
    ]
    # A `*args` handler has no fixed positionals and never gets a context.
    return len(positional) == param_count + 1


def _to_node_value(action, value) -> execution_result_pb2.NodeValueExecutionResult:
    """Wrap a handler's return value in a ``NodeValueExecutionResult``.

    Raw data goes out as a value; a returned sub flow function is registered on the
    action and reported as a ``SubFlowFunctionResult`` so the flow can invoke it later.
    """
    definition = as_sub_flow_function_definition(value)
    if definition is not None:
        return execution_result_pb2.NodeValueExecutionResult(
            sub_flow_function_result=build_sub_flow_function_result(action, definition)
        )
    return execution_result_pb2.NodeValueExecutionResult(
        raw_value=construct_value(value if value is not None else None)
    )


def handle(action, execution) -> None:
    action.emit(CodeZeroEvent.execution_request_received, execution)

    target = _resolve_target(action, execution.function_identifier)
    if target is None:
        if action.is_sub_flow_function_identifier(execution.function_identifier):
            # A sub flow function this action returned earlier, whose maximum
            # lifetime has passed (or which was deleted). Fail the node rather than
            # staying silent, so the flow does not wait for a result that cannot come.
            asyncio.ensure_future(
                _send_error(
                    action,
                    execution,
                    RuntimeError(
                        "SUB_FLOW_FUNCTION_EXPIRED",
                        f"Sub flow function {execution.function_identifier} is no "
                        f"longer registered: its maximum lifetime has passed",
                    ),
                    _now_micros(),
                )
            )
            return
        print("Received execution request for unknown function:", execution.function_identifier)
        return

    params = _build_params(action, execution, target)

    conf = action.configs.get(execution.project_id) or ProjectConfiguration(
        project_id=0,
        config_values=[],
        find_config=lambda identifier: None,
    )

    from hercules.types import FunctionContext

    context = FunctionContext(
        project_id=execution.project_id,
        execution_id=execution.execution_identifier,
        matched_config=conf,
        execute_flow=lambda flow_id, payload=None: action.execute_flow(flow_id, payload),
    )

    started_at = _now_micros()
    handler = target.handler
    all_params = (
        [context, *params] if _wants_context(handler, len(params)) else params
    )

    asyncio.ensure_future(_run(action, execution, handler, all_params, started_at))


async def _run(action, execution, handler, all_params, started_at) -> None:
    try:
        value = handler(*all_params)
        if inspect.isawaitable(value):
            value = await value
        finished_at = _now_micros()
        request = action_pb2.ActionTransferRequest(
            result=action_pb2.ActionExecutionResponse(
                execution_identifier=execution.execution_identifier,
                node_result=execution_result_pb2.NodeExecutionResult(
                    started_at=started_at,
                    finished_at=finished_at,
                    parameter_results=[],
                    success=_to_node_value(action, value),
                ),
            )
        )
        await action.send(request)
    except Exception as error:  # noqa: BLE001
        await _send_error(action, execution, error, started_at)


async def _send_error(action, execution, error, started_at) -> None:
    """Report a failed execution back to Aquila."""
    finished_at = _now_micros()
    is_runtime_error = isinstance(error, RuntimeError)
    proto_error = errors_pb2.Error(
        code=error.code if is_runtime_error else "UNKNOWN_ERROR",
        category="RUNTIME",
        message=(error.description or str(error)) if is_runtime_error else str(error),
        timestamp=finished_at,
        version=action.version,
    )
    request = action_pb2.ActionTransferRequest(
        result=action_pb2.ActionExecutionResponse(
            execution_identifier=execution.execution_identifier,
            node_result=execution_result_pb2.NodeExecutionResult(
                started_at=started_at,
                finished_at=finished_at,
                parameter_results=[],
                error=proto_error,
            ),
        )
    )
    try:
        await action.send(request)
    except Exception as err:  # noqa: BLE001
        print("Failed to send execution error:", err)
