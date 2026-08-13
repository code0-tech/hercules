from hercules import Identifier, Name, Parameter

from functions.fibonacci_runtime_function import FibonacciRuntimeFunction


@Identifier("fibonacci")
@Name({"code": "en-US", "content": "Compute Fibonacci Number"})
@Parameter(
    {
        "runtime_name": "test",
        "name": [{"code": "en-US", "content": "Input Number"}],
        "description": [
            {"code": "en-US", "content": "The position in the Fibonacci sequence"}
        ],
        "default_value": 10,
    }
)
class FibonacciFunction(FibonacciRuntimeFunction):
    pass
