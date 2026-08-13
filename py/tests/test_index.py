"""Port of ``ts/test/index.test.ts``."""
from hercules import EventSetting, Identifier, Parameter
from hercules._metadata import get_metadata
from hercules.map.event import event_map
from hercules.map.runtime_event import runtime_event_map
from hercules.definitions.rest_action.runtime_flow_types.rest import Rest


REST_SETTING_ORDER = [
    "http_schema",
    "http_url",
    "http_method",
    "http_auth",
    "http_auth_value",
    "input_schema",
]


class TestParameterDecorator:
    def test_preserves_source_order(self):
        @Parameter({"runtime_name": "first"})
        @Parameter({"runtime_name": "second"})
        @Parameter({"runtime_name": "third"})
        class Foo:
            pass

        parameters = get_metadata("hercules:function_parameters", Foo)
        assert [p.runtime_name for p in parameters] == ["first", "second", "third"]

    def test_works_for_single_parameter(self):
        @Parameter({"runtime_name": "only"})
        class Bar:
            pass

        parameters = get_metadata("hercules:function_parameters", Bar)
        assert [p.runtime_name for p in parameters] == ["only"]


class TestEventMap:
    def test_keeps_runtime_setting_order_regardless_of_override_order(self):
        @Identifier("ScrambledOverrides")
        @EventSetting({"identifier": "input_schema", "hidden": True, "default_value": {}})
        @EventSetting({"identifier": "http_auth_value", "hidden": True})
        @EventSetting({"identifier": "http_schema", "hidden": True, "default_value": "application/json"})
        @EventSetting({"identifier": "http_method", "hidden": True, "default_value": "POST"})
        class ScrambledOverrides(Rest):
            pass

        definition = event_map(ScrambledOverrides)
        assert [s.identifier for s in definition.settings] == REST_SETTING_ORDER

    def test_merges_override_properties(self):
        @Identifier("MethodOverride")
        @EventSetting({"identifier": "http_method", "hidden": True, "default_value": "POST"})
        class MethodOverride(Rest):
            pass

        http_method = next(
            s for s in event_map(MethodOverride).settings if s.identifier == "http_method"
        )
        assert http_method.hidden is True
        assert http_method.default_value == "POST"
        assert http_method.name[0].content == "Method"

    def test_does_not_pollute_runtime_settings(self):
        @Identifier("PollutionCheck")
        @EventSetting({"identifier": "http_method", "hidden": True, "default_value": "POST"})
        class PollutionCheck(Rest):
            pass

        event_map(PollutionCheck)

        rest_settings = runtime_event_map(Rest).settings or []
        assert [s.identifier for s in rest_settings] == REST_SETTING_ORDER
        assert next(s for s in rest_settings if s.identifier == "http_method").hidden is None


class TestEventSettingDecorator:
    def test_preserves_source_order(self):
        @EventSetting({"identifier": "first"})
        @EventSetting({"identifier": "second"})
        @EventSetting({"identifier": "third"})
        class Event:
            pass

        settings = get_metadata("hercules:flow_settings", Event)
        assert [s.identifier for s in settings] == ["first", "second", "third"]
