#[hercules_sdk::runtime_event(
    identifier = "user_created",
    signature = "(): { userId: NUMBER }",
    name(en_US = "User created event"),
    display_message(en_US = "Triggers on user creation"),
    description(
        en_US = "Triggers on user creation and has a payload including the user database id"
    )
)]
pub struct UserCreatedRuntimeEvent;
