from hercules import (
    DisplayMessage,
    FunctionContext,
    Identifier,
    Name,
    Parameter,
    RuntimeFunctionRunnable,
    Signature,
)


@Identifier("for_each_runtime")
@Signature("<T>(list: LIST<T>, consumer: CONSUMER<T>): void")
@Name({"code": "en-US", "content": "For Each"})
@DisplayMessage({"code": "en-US", "content": "For each element of ${list} do ${consumer}"})
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
        "runtime_name": "consumer",
        "name": [{"code": "en-US", "content": "Consumer"}],
        "description": [
            {
                "code": "en-US",
                "content": "The sub flow (item) => void executed once per element",
            }
        ],
    }
)
class ForEachRuntimeFunction(RuntimeFunctionRunnable):
    async def run(self, context: FunctionContext, items, consumer):
        for element in items:
            result = await consumer(element)
            print("[for_each] sub flow result:", result)
