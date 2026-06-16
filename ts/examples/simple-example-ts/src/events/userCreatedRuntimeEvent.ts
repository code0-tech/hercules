import {Identifier, Name, EventSetting, Signature} from "@code0-tech/hercules";

@Identifier("user_created")
@Signature("(userId: number): void")
@Name({code: "en-US", content: "User Created"})
@EventSetting({
    identifier: "FILTER_ROLE",
    name: [{code: "en-US", content: "Role Filter"}],
    description: [{code: "en-US", content: "Only trigger for users with this role"}],
    optional: true,
})
export class UserCreatedRuntimeEvent {}
