import {FunctionParameter, Identifier, Name} from "@code0-tech/hercules";
import {FibonacciRuntimeFunction} from "./fibonacciRuntimeFunction.js";

@Identifier("fibonacci")
@Name({code: "en-US", content: "Compute Fibonacci Number"})
@FunctionParameter({
    runtimeName: "test",
    name: [{code: "en-US", content: "Input Number"}],
    description: [{code: "en-US", content: "The position in the Fibonacci sequence"}],
    defaultValue: 10,
})
export class FibonacciFunction extends FibonacciRuntimeFunction {}
