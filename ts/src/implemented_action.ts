import {createSdk} from "./action_sdk.js";
import {Struct, Value} from "@code0-tech/tucana/pb/shared.struct_pb.js";
import {constructValue} from "@code0-tech/tucana/helpers/shared.struct_helper.js";

const sdk = createSdk({
    token: "your_token_here",
    actionUrl: "127.0.0.1:50051",
    actionId: "action_123",
    version: "0.0.0",
})

sdk.registerConfigDefinitions({
    type: {
        signature: "string",
        identifier: "STRING",
        version: "0.0.0",
        rules: [],
        name: [],
        genericKeys: [],
        alias: [],
        displayMessage: [],
        linkedDataTypeIdentifiers: [],
        definitionSource: ""
    },
    name: [],
    description: [],
    identifier: "config_discord_bot_token",
})

sdk.registerDataType({
    identifier: "STRING",
    signature: "string",
    name: [],
    alias: [],
    rules: [],
    genericKeys: [],
    displayMessage: [],
    definitionSource: "",
    linkedDataTypeIdentifiers: [],
    version: "0.0.0",
})


sdk.connect()
//
// type Member = {
//     id: string,
//     username: string,
// }
//
//
// function test(a: string): void {
//
// }
//
// sdk.registerFunctionDefinition({
//     alias: [
//         {code: "en", content: "kick_user"}
//     ],
//     deprecationMessage: [
//     ],
//     description: [
//         {code: "en", content: "Kicks a member from the Discord guild"}
//     ],
//     displayIcon: "https://example.com/kick_icon.png",
//     displayMessage: [
//         {code: "en", content: "Kicking user..."}
//     ],
//     documentation: [
//         {
//             code: "en",
//             content: "This function removes a specified member from the Discord guild. Ensure you have the necessary permissions to perform this action."
//         }
//     ],
//     genericKeys: [],
//     name: [
//         {code: "en", content: "Kick User"}
//     ],
//     throwsError: true,
//     version: "0.0.0",
//     runtimeName: "kickUser",
//     runtimeParameterDefinitions: [
//         {
//             dataTypeIdentifier: {
//                 type: {
//                     oneofKind: "dataTypeIdentifier",
//                     dataTypeIdentifier: "discord_member"
//                 }
//             },
//             runtimeName: "memberToKick",
//             name: [{code: "en", content: "Member to Kick"}],
//             description: [{code: "en", content: "The Discord member to kick from the guild"}],
//             documentation: [{
//                 code: "en",
//                 content: "Provide the Discord member object representing the user to be kicked."
//             }],
//         },
//         {
//             dataTypeIdentifier: {
//                 type: {
//                     oneofKind: "dataTypeIdentifier",
//                     dataTypeIdentifier: "string"
//                 }
//             },
//             defaultValue: constructValue("No reason provided"),
//             runtimeName: "reason",
//             name: [{code: "en", content: "Reason to Kick"}],
//             description: [{code: "en", content: "The reason for kicking the member"}],
//             documentation: [{
//                 code: "en",
//                 content: "Optionally provide a reason for kicking the member."
//             }],
//         }
//     ]
// }, async (params: Struct) => {
//     const member = params.fields["memberToKick"];
//
//     console.log("performing kick for member:", member);
// })
//
// sdk.registerDataType(
//     {
//         variant: DefinitionDataType_Variant.OBJECT,
//         identifier: "discord_member",
//         name: [{code: "en", content: "Discord Member"}],
//         displayMessage: [{code: "en", content: "Discord Member Object"}],
//         alias: [{code: "en", content: "discord_member"}],
//         genericKeys: [],
//         version: "0.0.0",
//         rules: [
//             {
//                 config: {
//                     oneofKind: "containsKey",
//                     containsKey: {
//                         key: "id",
//                         dataTypeIdentifier: {
//                             type: {
//                                 oneofKind: "dataTypeIdentifier",
//                                 dataTypeIdentifier: "string"
//                             }
//                         },
//                     }
//                 },
//
//             },
//             {
//                 config: {
//                     oneofKind: "containsKey",
//                     containsKey: {
//                         key: "username",
//                         dataTypeIdentifier: {
//                             type: {
//                                 oneofKind: "dataTypeIdentifier",
//                                 dataTypeIdentifier: "string"
//                             }
//                         },
//                     }
//                 },
//             }
//         ]
//     }
// )
//
// sdk.registerFlowType(
//     {
//         identifier: "discord_on_guild_join",
//         settings: [],
//         inputTypeIdentifier: "discord_member",
//         editable: false,
//         name: [{code: "en", content: "On Guild Join"}],
//         description: [{code: "en", content: "Triggered when the bot joins a new guild"}],
//         documentation: [{
//             code: "en",
//             content: "This flow type is triggered whenever the Discord bot joins a new guild."
//         }],
//         displayMessage: [{code: "en", content: "Waiting for guild join..."}],
//         alias: [{code: "en", content: "discord_on_guild_join"}],
//         version: "0.0.1",
//         displayIcon: "https://example.com/discord_icon.png",
//     }
// )
//
// const discordBot: any = {};
//
// discordBot.onGuildJoin.addEvent((event: { member: Member }) => {
//     sdk.dispatchEvent("discord_on_guild_join", event.member)
// })