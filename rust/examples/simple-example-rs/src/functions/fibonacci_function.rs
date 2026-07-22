use super::fibonacci_runtime_function::FibonacciRuntimeFunction;

/// The public, user-facing variant of [`FibonacciRuntimeFunction`]: same
/// execution behavior, its own identifier and a default input value.
/// Execution always dispatches through the runtime function — this struct
/// carries no `run()` of its own, only metadata overrides.
#[hercules::function(base = FibonacciRuntimeFunction, identifier = "fibonacci")]
#[parameter(
    runtime_name = "test",
    name(en_US = "Input Number"),
    description(en_US = "The position in the Fibonacci sequence"),
    default_value = 10
)]
pub struct FibonacciFunction;
