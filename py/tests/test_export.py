"""Port of ``ts/test/export.test.ts``."""
import asyncio
import os

import pytest
from google.protobuf import json_format

from hercules import Action, registered_actions
from tucana.generated.shared import module_pb2


def create_action(identifier="test-action"):
    return Action(
        identifier,
        "1.2.3",
        None,
        "code0-tech",
        "tabler:bolt",
        "docs",
        [{"code": "en-US", "content": "Test Action"}],
    )


@pytest.fixture(autouse=True)
def _clear_export_env():
    yield
    os.environ.pop("HERCULES_EXPORT", None)


def test_build_module_is_serializable_as_protobuf_json():
    action = create_action()
    json_text = json_format.MessageToJson(action.build_module())
    roundtrip = json_format.Parse(json_text, module_pb2.Module())
    assert roundtrip.identifier == "test-action"
    assert roundtrip.version == "1.2.3"
    assert roundtrip.author == "code0-tech"


def test_registers_constructed_actions_when_export_set():
    os.environ["HERCULES_EXPORT"] = "1"
    action = create_action("registered-action")
    assert registered_actions()[-1] is action


def test_does_not_register_without_export():
    before = len(registered_actions())
    create_action("unregistered-action")
    assert len(registered_actions()) == before


def test_connect_is_noop_in_export_mode():
    os.environ["HERCULES_EXPORT"] = "1"
    action = create_action()
    assert asyncio.get_event_loop().run_until_complete(action.connect("token")) is None
    assert action.stream is None
