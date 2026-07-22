use hercules::{
    async_trait, Arguments, FunctionContext, PlainValue, Result, RuntimeFunctionHandler,
};

#[hercules::runtime_function(
    identifier = "fibonacci_runtime",
    signature = "(test: NUMBER): NUMBER",
    name(en_US = "Fibonacci (Runtime)"),
    display_message(en_US = "Computes the n-th Fibonacci number"),
    omit_definition
)]
#[parameter(runtime_name = "test", name(en_US = "N"))]
pub struct FibonacciRuntimeFunction;

#[async_trait]
impl RuntimeFunctionHandler for FibonacciRuntimeFunction {
    async fn run(&self, context: &FunctionContext, args: &Arguments) -> Result<PlainValue> {
        // Missing or malformed, `args.get` reports it back to Aquila as a
        // runtime error on its own — nothing to check by hand here.
        let n: u64 = args.get("test")?;

        log::debug!(
            "computing fibonacci({n}) for project={} execution={}",
            context.project_id,
            context.execution_id
        );
        Ok(fib(n).into())
    }
}

fn fib(n: u64) -> u64 {
    if n <= 1 {
        n
    } else {
        fib(n - 1) + fib(n - 2)
    }
}
