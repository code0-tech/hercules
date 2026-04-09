import {DataTypeServiceClient, DataTypeUpdateRequest} from "@code0-tech/tucana/aquila";
import {logger} from "../../logger";
import {SdkState} from "../../types";
import {RpcOptions} from "@protobuf-ts/runtime-rpc";

export async function handleDataTypes(state: SdkState, builtOptions: RpcOptions, config: {
    authToken: string;
    aquilaUrl: string;
    actionId: string;
    version: string
}) {
    const dataTypeClient = new DataTypeServiceClient(state.transport)
    await dataTypeClient.update(DataTypeUpdateRequest.create({
        dataTypes: [
            ...state.dataTypes
        ]
    }), builtOptions).then(value => {
        if (!value.response.success) {
            return Promise.reject(value.response);
        }
    }).catch(reason => {
        logger.error({
            err: reason,
            config,
        }, "Error while updating data types")
        return Promise.reject(reason);
    })
    logger.debug("Sent data types request")
}
