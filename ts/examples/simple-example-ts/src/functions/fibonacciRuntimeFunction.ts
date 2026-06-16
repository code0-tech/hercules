import {
    DisplayMessage,
    FunctionContext,
    Identifier,
    Name,
    OmitFunctionDefinition,
    RuntimeParameter,
    Signature,
} from "@code0-tech/hercules";

@Identifier("fibonacci_runtime")
@Signature("(n: number): number")
@Name({code: "en-US", content: "Fibonacci (Runtime)"})
@DisplayMessage({code: "en-US", content: "Computes the n-th Fibonacci number"})
@OmitFunctionDefinition()
@RuntimeParameter({runtimeName: "n", name: [{code: "en-US", content: "N"}]})
export class FibonacciRuntimeFunction {
    run(context: FunctionContext, n: number): number {
        console.log(`[fibonacci] project=${context.projectId} execution=${context.executionId}`);
        return this.fib(n);
    }

    private fib(n: number): number {
        if (n <= 1) return n;
        return this.fib(n - 1) + this.fib(n - 2);
    }
}
