import {Description, DisplayMessage, Identifier, Name, Signature} from "@code0-tech/hercules";

@Identifier("user_created")
@Signature("(): {userId: number}")
@Name({code: "en-US", content: "User created event"})
@DisplayMessage({code: "en-US", content: "Triggers on user creation"})
@Description({code: "en-US", content: "Triggers on user creation and has a payload including the user database id"})
export class UserCreatedRuntimeEvent {}
