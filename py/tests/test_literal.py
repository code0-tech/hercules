"""Port of ``ts/test/literal.test.ts``."""
import asyncio

import pytest

from hercules.internal.literal import resolve_literal, resolve_node_value
from tucana.generated.aquila import action_pb2
from tucana.generated.shared import struct_pb2


# --- Minimal Value builders so the tests read like the data they describe. ---
def _str(string_value):
    return struct_pb2.Value(string_value=string_value)


def _int(n):
    return struct_pb2.Value(number_value=struct_pb2.NumberValue(integer=n))


def _bool(b):
    return struct_pb2.Value(bool_value=b)


def _list(*values):
    return struct_pb2.Value(list_value=struct_pb2.ListValue(values=list(values)))


def _struct(fields):
    return struct_pb2.Value(struct_value=struct_pb2.Struct(fields=fields))


def _literal_ref(signature, value, references=()):
    return action_pb2.ActionInlineReferenceValue(
        signature=signature,
        value=action_pb2.ActionNodeValue(
            literal_value=action_pb2.ActionLiteralValue(value=value, references=list(references))
        ),
    )


def _literal(value=None, references=()):
    kwargs = {"references": list(references)}
    if value is not None:
        kwargs["value"] = value
    return action_pb2.ActionLiteralValue(**kwargs)


# resolve_literal only touches the action for sub flow references.
_NOOP_ACTION = object()


class TestResolveLiteral:
    def test_returns_plain_literal_untouched_without_references(self):
        assert resolve_literal(_NOOP_ACTION, _literal(_str("hello"))) == "hello"
        assert resolve_literal(_NOOP_ACTION, _literal(_int(42))) == 42
        assert resolve_literal(_NOOP_ACTION, _literal(None)) is None

    def test_adopts_referenced_value_on_sole_placeholder(self):
        result = resolve_literal(_NOOP_ACTION, _literal(_str("${count}"), [_literal_ref("count", _int(7))]))
        assert result == 7

    def test_preserves_non_string_reference_types_on_full_replacement(self):
        result = resolve_literal(_NOOP_ACTION, _literal(_str("${enabled}"), [_literal_ref("enabled", _bool(True))]))
        assert result is True

    def test_interpolates_references_into_text(self):
        result = resolve_literal(
            _NOOP_ACTION,
            _literal(
                _str("Hello ${name}, you are ${age}"),
                [_literal_ref("name", _str("Ada")), _literal_ref("age", _int(36))],
            ),
        )
        assert result == "Hello Ada, you are 36"

    def test_leaves_unknown_signatures_untouched(self):
        assert resolve_literal(_NOOP_ACTION, _literal(_str("${missing}"))) == "${missing}"
        assert resolve_literal(_NOOP_ACTION, _literal(_str("a ${missing} b"))) == "a ${missing} b"

    def test_resolves_placeholders_in_nested_structs_and_lists(self):
        value = _struct(
            {
                "greeting": _str("Hi ${name}"),
                "tags": _list(_str("${primary}"), _str("static")),
            }
        )
        result = resolve_literal(
            _NOOP_ACTION,
            _literal(value, [_literal_ref("name", _str("Grace")), _literal_ref("primary", _int(1))]),
        )
        assert result == {"greeting": "Hi Grace", "tags": [1, "static"]}

    def test_stringifies_structured_references_during_interpolation(self):
        result = resolve_literal(
            _NOOP_ACTION,
            _literal(_str("payload=${obj}"), [_literal_ref("obj", _struct({"a": _int(1)}))]),
        )
        assert result == 'payload={"a":1}'

    def test_resolves_references_that_contain_references(self):
        nested = _literal_ref("outer", _str("<${inner}>"), [_literal_ref("inner", _str("deep"))])
        result = resolve_literal(_NOOP_ACTION, _literal(_str("${outer}"), [nested]))
        assert result == "<deep>"

    def test_raises_when_sub_flow_reference_is_interpolated(self):
        class _Action:
            async def execute_sub_flow(self, *args):
                return None

        sub_flow_ref = action_pb2.ActionInlineReferenceValue(
            signature="run",
            value=action_pb2.ActionNodeValue(
                sub_flow=action_pb2.ActionNodeSubFlowValue(execution_identifier="x")
            ),
        )
        with pytest.raises(Exception, match="cannot be interpolated"):
            resolve_literal(_Action(), _literal(_str("result: ${run}"), [sub_flow_ref]))


class TestResolveNodeValue:
    def test_returns_none_for_absent_node(self):
        assert resolve_node_value(_NOOP_ACTION, None) is None

    def test_wraps_sub_flow_node_in_caller_exposing_schema(self):
        calls = []

        class _Action:
            async def execute_sub_flow(self, sub_flow, *args):
                calls.append((sub_flow, *args))
                return "done"

        node = action_pb2.ActionNodeValue(
            sub_flow=action_pb2.ActionNodeSubFlowValue(execution_identifier="sf")
        )
        caller = resolve_node_value(_Action(), node)
        assert callable(caller)
        assert caller.input_schema == node.sub_flow.input_schema
        assert asyncio.get_event_loop().run_until_complete(caller("a")) == "done"
        assert calls == [(node.sub_flow, "a")]
