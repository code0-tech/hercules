from hercules import Description, DisplayMessage, Identifier, Name, Signature


@Identifier("user_created")
@Signature("(): {userId: number}")
@Name({"code": "en-US", "content": "User created event"})
@DisplayMessage({"code": "en-US", "content": "Triggers on user creation"})
@Description(
    {
        "code": "en-US",
        "content": "Triggers on user creation and has a payload including the user database id",
    }
)
class UserCreatedRuntimeEvent:
    pass
