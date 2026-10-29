"""Port of ``ts/test/execution.test.ts``."""
import asyncio

import pytest

from hercules import Action, SubFlowFunctionDefinition
from hercules.schema import BaseModel, RootModel
from hercules.actions.execution import handle
from hercules.manager.sub_flow_function import (
    SUB_FLOW_FUNCTION_TTL_SECONDS,
    SubFlowFunctionManager,
)
from hercules.models.runtime_function import RuntimeFunctionProps
from tucana.generated.aquila import action_pb2
from tucana.generated.shared import struct_pb2


class GreetInput(BaseModel):
    name: str


class GreetOutput(RootModel[str]):
    pass


def _str(string_value):
    return struct_pb2.Value(string_value=string_value)


def _literal_param(value):
    return action_pb2.ActionNodeValue(
        literal_value=action_pb2.ActionLiteralValue(value=value, references=[])
    )


class _StubStream:
    """Records everything the action would send to Aquila."""

    def __init__(self):
        self.sent = []

    async def write(self, request):
        self.sent.append(request)


@pytest.fixture
def action():
    action = Action(
        "my_action", "1.0.0", None, "me", "icon", "docs",
        [{"code": "en-US", "content": "My Action"}],
    )
    action._stream = _StubStream()
    return action


@pytest.fixture
def sent(action):
    return action._stream.sent


def _runtime_function(handler, parameters=()):
    return RuntimeFunctionProps(
        runtime_name="fn",
        signature="(): STRING",
        handler=handler,
        parameters=list(parameters),
    )


def _request(function_identifier, parameters=()):
    return action_pb2.ActionExecutionRequest(
        execution_identifier="exec-1",
        function_identifier=function_identifier,
        parameters=list(parameters),
        project_id=1,
    )


def _sub_flow_function(run):
    return SubFlowFunctionDefinition(
        name="greet",
        description="Greets someone",
        input_schema=GreetInput,
        output_schema=GreetOutput,
        run=run,
    )


def _run_handle(action, request):
    """Dispatch a request and drain the task the handler schedules."""

    async def main():
        handle(action, request)
        # Let the task the handler created run to completion.
        await asyncio.sleep(0)
        await asyncio.sleep(0)

    asyncio.new_event_loop().run_until_complete(main())


def _node_result(sent):
    assert len(sent) == 1
    return sent[0].result.node_result


def _success(sent):
    node_result = _node_result(sent)
    assert node_result.WhichOneof("result") == "success"
    return node_result.success


def test_reports_raw_data_as_a_raw_value(action, sent):
    action.runtime_functions.set("fn", _runtime_function(lambda: "hello"))

    _run_handle(action, _request("fn"))

    success = _success(sent)
    assert success.WhichOneof("value") == "raw_value"
    assert success.raw_value == _str("hello")


def test_registers_a_returned_sub_flow_function_and_reports_it(action, sent):
    action.runtime_functions.set(
        "fn", _runtime_function(lambda: _sub_flow_function(lambda name: f"Hi {name}"))
    )

    _run_handle(action, _request("fn"))

    success = _success(sent)
    assert success.WhichOneof("value") == "sub_flow_function_result"
    result = success.sub_flow_function_result
    assert result.name == "greet"
    assert result.description == "Greets someone"
    # The Pydantic models are converted to JSON schemas before they are sent.
    assert result.input_schema == struct_pb2.Struct(
        fields={
            "title": _str("GreetInput"),
            "type": _str("object"),
            "properties": struct_pb2.Value(
                struct_value=struct_pb2.Struct(
                    fields={
                        "name": struct_pb2.Value(
                            struct_value=struct_pb2.Struct(
                                fields={"title": _str("Name"), "type": _str("string")}
                            )
                        )
                    }
                )
            ),
            "required": struct_pb2.Value(
                list_value=struct_pb2.ListValue(values=[_str("name")])
            ),
        }
    )
    assert result.output_schema == struct_pb2.Struct(
        fields={"title": _str("GreetOutput"), "type": _str("string")}
    )
    assert result.function.definition_source == "action"
    # The identifier Aquila invokes the function by is registered on the action.
    assert action.sub_flow_functions.has(result.function.function_identifier)


def test_accepts_a_sub_flow_function_returned_as_a_dict(action, sent):
    action.runtime_functions.set("fn", _runtime_function(lambda: {
        "name": "greet",
        "description": "Greets someone",
        "input_schema": {},
        "output_schema": {},
        "run": lambda: None,
    }))

    _run_handle(action, _request("fn"))

    success = _success(sent)
    assert success.WhichOneof("value") == "sub_flow_function_result"
    assert success.sub_flow_function_result.name == "greet"


def test_passes_a_plain_json_schema_dict_through_unchanged(action, sent):
    definition = _sub_flow_function(lambda: None)
    definition.output_schema = {"type": "string"}
    action.runtime_functions.set("fn", _runtime_function(lambda: definition))

    _run_handle(action, _request("fn"))

    result = _success(sent).sub_flow_function_result
    assert result.output_schema == struct_pb2.Struct(fields={"type": _str("string")})


def test_gives_each_returned_sub_flow_function_its_own_identifier(action, sent):
    action.runtime_functions.set(
        "fn", _runtime_function(lambda: _sub_flow_function(lambda: None))
    )

    _run_handle(action, _request("fn"))
    _run_handle(action, _request("fn"))

    assert len(sent) == 2
    assert action.sub_flow_functions.size == 2


def test_executes_a_registered_sub_flow_function_with_every_request_parameter(action, sent):
    identifier = action.register_sub_flow_function(
        _sub_flow_function(lambda name: f"Hi {name}")
    )

    _run_handle(action, _request(identifier, [_literal_param(_str("Ada"))]))

    success = _success(sent)
    assert success.WhichOneof("value") == "raw_value"
    assert success.raw_value == _str("Hi Ada")


def test_reports_an_unnamed_sub_flow_function_as_an_error(action, sent):
    definition = _sub_flow_function(lambda: None)
    definition.name = ""
    action.runtime_functions.set("fn", _runtime_function(lambda: definition))

    _run_handle(action, _request("fn"))

    node_result = _node_result(sent)
    assert node_result.WhichOneof("result") == "error"
    assert node_result.error.code == "SUB_FLOW_FUNCTION_MISSING_NAME"
    assert action.sub_flow_functions.size == 0


class TestSubFlowFunctionLifetime:
    """The registry drops a sub flow function once its maximum lifetime has passed."""

    @staticmethod
    def _manager(monkeypatch, clock):
        manager = SubFlowFunctionManager()
        monkeypatch.setattr(SubFlowFunctionManager, "_now", staticmethod(lambda: clock[0]))
        return manager

    def test_default_lifetime_is_30_minutes(self):
        assert SUB_FLOW_FUNCTION_TTL_SECONDS == 30 * 60

    def test_keeps_a_function_invocable_right_up_to_its_lifetime(self, monkeypatch):
        clock = [0.0]
        manager = self._manager(monkeypatch, clock)
        manager.set("a", "fn")

        clock[0] += SUB_FLOW_FUNCTION_TTL_SECONDS - 0.001

        assert manager.get("a") == "fn"

    def test_drops_a_function_once_its_lifetime_has_passed(self, monkeypatch):
        clock = [0.0]
        manager = self._manager(monkeypatch, clock)
        manager.set("a", "fn")

        clock[0] += SUB_FLOW_FUNCTION_TTL_SECONDS

        assert manager.get("a") is None
        assert manager.size == 0

    def test_does_not_extend_a_lifetime_when_the_function_is_invoked(self, monkeypatch):
        clock = [0.0]
        manager = self._manager(monkeypatch, clock)
        manager.set("a", "fn")

        clock[0] += SUB_FLOW_FUNCTION_TTL_SECONDS / 2
        assert manager.get("a") == "fn"
        clock[0] += SUB_FLOW_FUNCTION_TTL_SECONDS / 2

        assert manager.get("a") is None

    def test_expires_entries_in_registration_order(self, monkeypatch):
        clock = [0.0]
        manager = self._manager(monkeypatch, clock)
        manager.set("first", "fn")
        clock[0] += SUB_FLOW_FUNCTION_TTL_SECONDS / 2
        manager.set("second", "fn")

        clock[0] += SUB_FLOW_FUNCTION_TTL_SECONDS / 2

        assert manager.get("first") is None
        assert manager.get("second") == "fn"

    def test_frees_an_expired_function_without_waiting_for_a_read(self):
        async def main():
            manager = SubFlowFunctionManager(ttl_seconds=0.05)
            manager.set("a", "fn")
            assert manager.size == 1
            # The scheduled sweep clears the entry on its own, so nothing is held
            # just because no one looked the function up again.
            await asyncio.sleep(0.1)
            assert len(manager.cache) == 0

        asyncio.new_event_loop().run_until_complete(main())

    def test_an_expired_function_fails_the_node_instead_of_running(self, action, sent):
        action.sub_flow_functions = SubFlowFunctionManager(ttl_seconds=0.0)
        identifier = action.register_sub_flow_function(
            _sub_flow_function(lambda name: f"Hi {name}")
        )

        _run_handle(action, _request(identifier, [_literal_param(_str("Ada"))]))

        node_result = _node_result(sent)
        assert node_result.WhichOneof("result") == "error"
        assert node_result.error.code == "SUB_FLOW_FUNCTION_EXPIRED"
        assert identifier in node_result.error.message

    def test_an_unknown_function_sends_nothing(self, action, sent):
        _run_handle(action, _request("not_a_function"))

        assert sent == []
