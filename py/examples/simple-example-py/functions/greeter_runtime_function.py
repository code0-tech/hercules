"""A runtime function whose run block returns another function instead of raw data.

Hercules registers the returned ``run`` internally and reports it to Aquila as a sub
flow function, so the flow can invoke it later. Name, description and the I/O schema
are declared here because nothing in the module definition describes a function that
is only created at runtime. The Pydantic models are converted to JSON schemas while
the result is sent.
"""
from hercules import (
    Description,
    DisplayMessage,
    FunctionContext,
    Identifier,
    Name,
    Parameter,
    RuntimeFunctionRunnable,
    Signature,
    SubFlowFunctionDefinition,
)
from hercules.schema import BaseModel, RootModel


class GreetInput(BaseModel):
    """The parameters the returned function accepts, keyed by parameter name."""

    name: str


class GreetOutput(RootModel[str]):
    """The value the returned function produces."""


@Identifier("greeter_runtime")
@Signature("(greeting: STRING): TRANSFORM<STRING, STRING>")
@Name({"code": "en-US", "content": "Greeter"})
@DisplayMessage({"code": "en-US", "content": "Build a greeter saying ${greeting}"})
@Parameter(
    {
        "runtime_name": "greeting",
        "name": [{"code": "en-US", "content": "Greeting"}],
        "description": [
            {
                "code": "en-US",
                "content": "The greeting the returned function prefixes a name with",
            }
        ],
    }
)
@Description({"code": "en-US", "content": "Returns a function that greets a name"})
class GreeterRuntimeFunction(RuntimeFunctionRunnable):
    def run(self, context: FunctionContext, greeting: str) -> SubFlowFunctionDefinition:
        return SubFlowFunctionDefinition(
            name="greet",
            description=f'Greets a name with "{greeting}"',
            input_schema=GreetInput,
            output_schema=GreetOutput,
            run=lambda name: f"{greeting} {name}",
        )
