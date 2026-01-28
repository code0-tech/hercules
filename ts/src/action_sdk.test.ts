import {createSdk} from "./action_sdk";
import {Server, ServerCredentials} from "@grpc/grpc-js"

console.log("Running tests")

const sdk = createSdk(
    {
        token: "some_token",
        version: "1.0.0",
        actionId: "someId",
        actionUrl: "someUrl",
    }
)

const server = new Server();



server.bindAsync("0.0.0.0:50051", ServerCredentials.createInsecure(), (error, port) => {
    console.log(error, port);
})


sdk.connect()

console.log("Tests ran successfully")