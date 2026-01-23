import {GrpcTransport} from "@protobuf-ts/grpc-transport";
import {ChannelCredentials} from "@grpc/grpc-js";
import {ActionTransferService, TransferRequest} from "@code0-tech/tucana/pb/aquila.action_pb.js";
import {ActionTransferServiceClient} from "@code0-tech/tucana/pb/aquila.action_pb.client.js";





const transport = new GrpcTransport({
    host: "localhost:5000",
    channelCredentials: ChannelCredentials.createInsecure(),
});


const transferClient = new ActionTransferServiceClient(transport);

const stream = transferClient.transfer({});



stream.requests.send(TransferRequest.create({
        data: {
            oneofKind: "configuration",
            configuration: {
                identifier: "action_123",
                version: "0.0.0",
                functionDefinitions: [],
                dataTypes: [],
                flowTypes: [],
                actionConfigurations: []
            }
        }
    }
)).catch(reason => {
    console.error(reason)
});


