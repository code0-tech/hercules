import {HerculesFunctionContext, Identifier, RuntimeParameter, Signature} from "@code0-tech/hercules";

@Identifier("fib")
@Signature("(number: number): number")
@RuntimeParameter({
    runtimeName: "number",
    defaultValue: 20
})
export class FibonacciFunction {
    run(context: HerculesFunctionContext, number: number): number {
        console.log(context)
        console.log("Project id:", context.projectId);
        console.log("Execution id:", context.executionId);
        console.log("Matched configs:", context.matchedConfig); // matched configs for the current execution

        function fibonacci(num: number): number {
            if (num <= 1) return num;
            return fibonacci(num - 1) + fibonacci(num - 2);
        }

        return fibonacci(number)
    }
}