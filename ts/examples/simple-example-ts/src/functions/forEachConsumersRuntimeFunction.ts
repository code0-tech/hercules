import {
    Consumer,
    DisplayMessage,
    FunctionContext,
    Identifier,
    List,
    Name,
    Parameter,
    Signature,
    SubFlow,
} from "@code0-tech/hercules";

@Identifier("for_each_consumers_runtime")
@Signature("<T>(list: LIST<T>, consumers: LIST<CONSUMER<T>>): void")
@Name({code: "en-US", content: "For Each (Multiple Consumers)"})
@DisplayMessage({code: "en-US", content: "For each element of ${list} run every consumer in ${consumers}"})
@Parameter({
    runtimeName: "list",
    name: [{code: "en-US", content: "List"}],
    description: [{code: "en-US", content: "The list whose elements are iterated over"}],
})
@Parameter({
    runtimeName: "consumers",
    name: [{code: "en-US", content: "Consumers"}],
    description: [{code: "en-US", content: "A list of sub flows (item) => void; every consumer is run once per element"}],
})
export class ForEachConsumersRuntimeFunction {
    async run<T>(_context: FunctionContext, list: List<T>, consumers: (Consumer<T> & SubFlow)[]): Promise<void> {
        console.log(`[for_each_consumers] received ${consumers.length} consumer(s)`);
        for (const element of list) {
            for (const [index, consumer] of consumers.entries()) {
                const result = await consumer(element);
                console.log(`[for_each_consumers] consumer #${index} result:`, result);
            }
        }
    }
}
