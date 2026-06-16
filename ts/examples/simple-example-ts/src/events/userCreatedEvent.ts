import {Editable, Identifier, Name} from "@code0-tech/hercules";
import {UserCreatedRuntimeEvent} from "./userCreatedRuntimeEvent.ts";

@Identifier("user_created_event")
@Name({code: "en-US", content: "On User Created"})
@Editable(false)
export class UserCreatedEvent extends UserCreatedRuntimeEvent {
}
