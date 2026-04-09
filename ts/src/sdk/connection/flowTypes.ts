import {ActionSdk, SdkState} from "../../types";
import {FlowTypeServiceClient, FlowTypeUpdateRequest} from "@code0-tech/tucana/aquila";
import {RpcOptions} from "@protobuf-ts/runtime-rpc";
import {logger} from "../../logger";

export async function handleFlowTypes(state: SdkState, builtOptions: RpcOptions | undefined, config: ActionSdk["config"]) {
    const flowTypeClient = new FlowTypeServiceClient(state.transport)
    const request = {
        flowTypes: [
            ...state.flowTypes
        ]
    };
    try {

        await flowTypeClient.update(FlowTypeUpdateRequest.create(request), builtOptions).then(value => {
            if (!value.response.success) {
                logger.error({
                    err: value.response,
                    request: value.request,
                    config,
                })
                return Promise.reject(value.response);
            }
        })

    } catch (error) {
        logger.error({
            err: error,
            request,
            config,
        }, "Error while updating flow types")
        return Promise.reject(error);
    }
}
