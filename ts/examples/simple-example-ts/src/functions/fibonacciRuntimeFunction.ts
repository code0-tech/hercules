import {
    DisplayMessage,
    FunctionContext, Parameter,
    Identifier,
    Name,
    OmitRuntimeFunction,
    Signature,
} from "@code0-tech/hercules";

@Identifier("fibonacci_runtime")
@Signature("(test: number): number")
@Name({code: "en-US", content: "Fibonacci (Runtime)"})
@DisplayMessage({code: "en-US", content: "Computes the n-th Fibonacci number"})
@OmitRuntimeFunction()
@Parameter({runtimeName: "test", name: [{code: "en-US", content: "N"}]})
export class FibonacciRuntimeFunction {
    run(context: FunctionContext, test: number): number {
        console.log(`[fibonacci] project=${context.projectId} execution=${context.executionId}`);
        return this.fib(test);
    }

    private fib(n: number): number {
        if (n <= 1) return n;
        return this.fib(n - 1) + this.fib(n - 2);
    }
}
