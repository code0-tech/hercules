"""Execution request handler (port of ``src/actions/Execution.ts``)."""
from __future__ import annotations

import asyncio
import inspect
import time

from hercules._tucana.helpers import construct_value, to_allowed_value
from tucana.generated.aquila import action_pb2
from tucana.generated.shared import errors_pb2, execution_result_pb2
from hercules.events import CodeZeroEvent
from hercules.types import ProjectConfiguration, RuntimeError

packet_type = "execution"


def _now_micros() -> int:
    return time.time_ns() // 1000


def _build_params(action, execution, func):
    params = []
    parameters = func.parameters or []
    for index, _param in enumerate(parameters):
        field = execution.parameters[index] if index < len(execution.parameters) else None
        which = field.WhichOneof("value") if field is not None else None
        if which == "literal_value":
            params.append(to_allowed_value(field.literal_value.value))
        elif which == "sub_flow":
            sub_flow = field.sub_flow

            def make_caller(sub_flow):
                async def caller(*args):
                    return await action.execute_sub_flow(sub_flow, *args)

                return caller

            params.append(make_caller(sub_flow))
        else:
            params.append(None)
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


def handle(action, execution) -> None:
    action.emit(CodeZeroEvent.execution_request_received, execution)

    func = action.runtime_functions.get(execution.function_identifier)
    if func is None:
        print("Received execution request for unknown function:", execution.function_identifier)
        return

    params = _build_params(action, execution, func)

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
    handler = func.handler
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
                    success=construct_value(value if value is not None else None),
                ),
            )
        )
        await action.send(request)
    except Exception as error:  # noqa: BLE001
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
