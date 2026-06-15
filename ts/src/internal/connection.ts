import {GrpcOptions, GrpcTransport} from "@protobuf-ts/grpc-transport";
import {ActionTransferRequest, ActionTransferResponse, ActionTransferServiceClient, ModuleServiceClient, ModuleUpdateRequest} from "@code0-tech/tucana/aquila";
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

    const response = await new ModuleServiceClient(transport).update(
        ModuleUpdateRequest.create({modules: [module]}),
        rpcOptions,
    );

    if (!response.response.success) {
        throw new Error("Module update failed");
    }

    const stream = new ActionTransferServiceClient(transport).transfer(rpcOptions);

    return {transport, stream};
}
