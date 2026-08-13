from hercules import (
    DisplayMessage,
    FunctionContext,
    Identifier,
    Name,
    OmitRuntimeFunction,
    Parameter,
    RuntimeFunctionRunnable,
    Signature,
)


@Identifier("fibonacci_runtime")
@Signature("(test: number): number")
@Name({"code": "en-US", "content": "Fibonacci (Runtime)"})
@DisplayMessage({"code": "en-US", "content": "Computes the n-th Fibonacci number"})
@OmitRuntimeFunction()
@Parameter({"runtime_name": "test", "name": [{"code": "en-US", "content": "N"}]})
class FibonacciRuntimeFunction(RuntimeFunctionRunnable):
    def run(self, context: FunctionContext, test):
        print(f"[fibonacci] project={context.project_id} execution={context.execution_id}")
        return self._fib(test)

    def _fib(self, n):
        if n <= 1:
            return n
        return self._fib(n - 1) + self._fib(n - 2)
