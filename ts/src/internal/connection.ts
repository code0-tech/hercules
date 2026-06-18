import {GrpcOptions, GrpcTransport} from "@protobuf-ts/grpc-transport";
import {ActionTransferRequest, ActionTransferResponse, ActionTransferServiceClient} from "@code0-tech/tucana/aquila";
import type {Module} from "@code0-tech/tucana/shared";
import {ChannelCredentials} from "@grpc/grpc-js";
import {type RpcOptions} from "@protobuf-ts/runtime-rpc";
import type {DuplexStreamingCall} from "@protobuf-ts/runtime-rpc";

export interface Connection {
    transport: GrpcTransport;
    stream: DuplexStreamingCall<ActionTransferRequest, ActionTransferResponse>;
}

export async function createConnection(
    module: Module,
    authToken: string,
    aquilaUrl: string,
    grpcOptions?: GrpcOptions,
): Promise<Connection> {
    const transport = new GrpcTransport({
        host: aquilaUrl,
        channelCredentials: ChannelCredentials.createInsecure(),
        ...grpcOptions,
    });

    const rpcOptions: RpcOptions = {meta: {"authorization": authToken}};

    const stream = new ActionTransferServiceClient(transport).transfer(rpcOptions);

    await stream.requests.send(ActionTransferRequest.create({
        data: {
            oneofKind: "logon",
            logon: {module},
        },
    }));

    return {transport, stream};
}
