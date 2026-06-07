import type {ActionSdk, SdkState} from "../../types";
import type {RpcOptions} from "@protobuf-ts/runtime-rpc";
import {
    RuntimeFunctionDefinitionServiceClient,
    RuntimeFunctionDefinitionUpdateRequest
} from "@code0-tech/tucana/aquila";

export async function handleRuntimeFunctionDefinitions(state: SdkState, builtOptions: RpcOptions | undefined, config: ActionSdk["config"]) {
    const request = RuntimeFunctionDefinitionUpdateRequest.create(
        {
            runtimeFunctions: [
                ...state.runtimeFunctions.map(func => ({
                    ...func.definition,
                }))
            ]
        }
    );
    try {
        const runtimeFunctionDefinitionClient = new RuntimeFunctionDefinitionServiceClient(state.transport)
        await runtimeFunctionDefinitionClient.update(
            request, builtOptions
        ).then(value => {
            if (!value.response.success) {
                console.error({
                    err: value.response,
                    request: value.request,
                    config,
                })
                return Promise.reject(value.response);
            }
        })
    } catch (error) {
        console.debug({
            ...request.runtimeFunctions[0].runtimeParameterDefinitions[0].defaultValue
        })
        logger.error({
            err: error,
            request: request,
            config,
        }, "Error while updating runtime function definitions")
        return Promise.reject(error);
    }
    logger.debug("Successfully updated runtime function definitions")
}
