import asyncio
import os

from hercules import Action, CodeZeroEvent

from data_types.email_data_type import EmailDataType
from events.user_created_runtime_event import UserCreatedRuntimeEvent
from functions.fibonacci_function import FibonacciFunction
from functions.fibonacci_runtime_function import FibonacciRuntimeFunction
from functions.for_each_runtime_function import ForEachRuntimeFunction
from functions.for_each_consumers_runtime_function import ForEachConsumersRuntimeFunction

action = Action(
    os.environ.get("ACTION_ID", "testing-action"),
    os.environ.get("VERSION", "0.0.0"),
    os.environ.get("AQUILA_URL", "127.0.0.1:8081"),
    "code0-tech",
    "tabler:bolt",
    "A simple example action",
    [{"code": "en-US", "content": "Example Action"}],
    [
        {
            "identifier": "EXAMPLE_CONFIG",
            "type": "string",
            "name": [{"code": "en-US", "content": "Example Config"}],
        }
    ],
)

# Runtime function (with OmitRuntimeFunction — no auto-generated function def).
action.register_runtime_function(FibonacciRuntimeFunction)

# Function: named public variant that extends the runtime function.
action.register_function(FibonacciFunction)

# Runtime function that executes a sub flow parameter for each element of a list.
action.register_runtime_function(ForEachRuntimeFunction)

# Runtime function that takes a list of consumers (each an inline ${signature} sub flow reference).
action.register_runtime_function(ForEachConsumersRuntimeFunction)

# Data type: derived from a schema.
action.register_data_type_class(EmailDataType)

# Runtime flow type: the internal event definition.
action.register_runtime_event_class(UserCreatedRuntimeEvent)


action.on(CodeZeroEvent.connected, lambda _action: print("Connected to aquila"))


def _on_error(error):
    print("Stream error:", error)


action.on(CodeZeroEvent.error, _on_error)


def _on_module_updated(message):
    print(message)
    print(action.configs.values())


action.on(CodeZeroEvent.module_updated, _on_module_updated)


async def main():
    auth_token = os.environ.get("AUTH_TOKEN", "your_auth_token_here")
    while True:
        try:
            await action.connect(auth_token)
        except Exception as err:  # noqa: BLE001
            print("Stream error:", err)
            print("Attempting to reconnect in 5s...")
            await asyncio.sleep(5)


if __name__ == "__main__":
    asyncio.run(main())
