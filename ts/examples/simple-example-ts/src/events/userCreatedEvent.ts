import {Editable, EventSetting, Identifier, Name} from "@code0-tech/hercules";
import {UserCreatedRuntimeEvent} from "./userCreatedRuntimeEvent.ts";

@Identifier("user_created_event")
@Name({code: "en-US", content: "On User Created"})
@Editable(false)
@EventSetting({
    identifier: "FILTER_ROLE",
    name: [{code: "en-US", content: "Role Filter"}],
    description: [{code: "en-US", content: "Only trigger for users with this role"}],
    optional: true,
})
export class UserCreatedEvent extends UserCreatedRuntimeEvent {}
