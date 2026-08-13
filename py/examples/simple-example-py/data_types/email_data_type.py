from hercules import Identifier, Name, Schema
from hercules.schema import RootModel, Annotated, StringConstraints


class EmailModel(RootModel[Annotated[str, StringConstraints(pattern=r"^[^@]+@[^@]+\.[^@]+$")]]):
    """An email address, described as a constrained string."""


@Identifier("email_address")
@Name({"code": "en-US", "content": "Email Address"})
@Schema(EmailModel)
class EmailDataType:
    pass
