import { ActionTransferService, TransferRequest } from "@code0-tech/tucana/pb/aquila.action_pb";
import { createSdk } from "./action_sdk";
import { createServer } from "nice-grpc";
import {TransferResponse} from "@code0-tech/tucana/pb/aquila.action_pb.js";

console.log("Running tests")

const sdk = createSdk(
    {
        token: "some_token",
        version: "1.0.0",
        actionId: "someId",
        actionUrl: "someUrl",
    }
)

const server = createServer();


server.add(ActionTransferService, {
    async *Transfer(requests: any, context: any): AsyncIterable<TransferResponse> {
        console.log("Transfer called");

        for await (const req of requests) {
            console.log("request", req);

            yield {
                // TransferResponse fields here
            };
        }
    },
});

await server.listen("0.0.0.0:50051");


sdk.connect()

console.log("Tests ran successfully")