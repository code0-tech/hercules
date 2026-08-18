from hercules import (
    DisplayMessage,
    FunctionContext,
    Identifier,
    Name,
    Parameter,
    RuntimeFunctionRunnable,
    Signature,
)


@Identifier("for_each_consumers_runtime")
@Signature("<T>(list: LIST<T>, consumers: LIST<CONSUMER<T>>): void")
@Name({"code": "en-US", "content": "For Each (Multiple Consumers)"})
@DisplayMessage(
    {"code": "en-US", "content": "For each element of ${list} run every consumer in ${consumers}"}
)
@Parameter(
    {
        "runtime_name": "list",
        "name": [{"code": "en-US", "content": "List"}],
        "description": [
            {"code": "en-US", "content": "The list whose elements are iterated over"}
        ],
    }
)
@Parameter(
    {
        "runtime_name": "consumers",
        "name": [{"code": "en-US", "content": "Consumers"}],
        "description": [
            {
                "code": "en-US",
                "content": "A list of sub flows (item) => void; every consumer is run once per element",
            }
        ],
    }
)
class ForEachConsumersRuntimeFunction(RuntimeFunctionRunnable):
    async def run(self, context: FunctionContext, items, consumers):
        print(f"[for_each_consumers] received {len(consumers)} consumer(s)")
        for element in items:
            for index, consumer in enumerate(consumers):
                result = await consumer(element)
                print(f"[for_each_consumers] consumer #{index} result:", result)
