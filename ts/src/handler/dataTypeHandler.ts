import {DataTypeServiceClient, DataTypeUpdateRequest} from "@code0-tech/tucana/aquila";
import {RpcOptions} from "@protobuf-ts/runtime-rpc";
import {CodeZeroAction, CodeZeroEvent} from "../index";

export async function handleDataTypes(action: CodeZeroAction, grpcOptions: RpcOptions) {
    const dataTypeClient = new DataTypeServiceClient(action.transport!)
    try {
        console.debug("Sent data types request")
        const call = await dataTypeClient.update(DataTypeUpdateRequest.create({
            dataTypes: [
                ...action.dataTypes
            ]
        }), grpcOptions)
        if (!call.response.success) {
            action.emit(CodeZeroEvent.dataTypesUpdateFailed, new Error("Failed to update data types"))
            return Promise.reject(call.response);
        }
        action.emit(CodeZeroEvent.dataTypesUpdated, call.response)
    } catch (error) {
        console.error({
            err: error,
        }, "Error while updating data types")
        return Promise.reject(error);
    }
}
