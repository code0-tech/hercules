import {
    Consumer,
    DisplayMessage,
    FunctionContext,
    Identifier,
    List,
    Name,
    OmitRuntimeFunction,
    Parameter,
    Signature,
} from "@code0-tech/hercules";

@Identifier("for_each_runtime")
@Signature("<T>(list: LIST<T>, consumer: CONSUMER<T>): void")
@Name({code: "en-US", content: "For Each"})
@DisplayMessage({code: "en-US", content: "For each element of ${list} do ${consumer}"})
@OmitRuntimeFunction()
@Parameter({
    runtimeName: "list",
    name: [{code: "en-US", content: "List"}],
    description: [{code: "en-US", content: "The list whose elements are iterated over"}],
})
@Parameter({
    runtimeName: "consumer",
    name: [{code: "en-US", content: "Consumer"}],
    description: [{code: "en-US", content: "The sub flow (item) => void executed once per element"}],
})
export class ForEachRuntimeFunction {
    async run<T>(_context: FunctionContext, list: List<T>, consumer: Consumer<T>): Promise<void> {
        for (const element of list) {
            const result = await consumer(element);
            console.log(`[for_each] sub flow result:`, result);
        }
    }
}
