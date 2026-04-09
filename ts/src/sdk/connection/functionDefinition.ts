import type {ActionSdk, SdkState} from "../../types";
import type {RpcOptions} from "@protobuf-ts/runtime-rpc";
import {FunctionDefinitionServiceClient, FunctionDefinitionUpdateRequest} from "@code0-tech/tucana/aquila";
import {logger} from "../../logger";

export async function handleFunctionDefinitions(state: SdkState, builtOptions: RpcOptions | undefined, config: ActionSdk["config"]) {
    const FunctionDefinitionClient = new FunctionDefinitionServiceClient(state.transport)
    try {
        const finishedCall = await FunctionDefinitionClient.update(
            FunctionDefinitionUpdateRequest.create(
                {
                    functions: [
                        ...state.functions.map(func => ({
                            ...func.definition,
                        }))
                    ]
                }
            ), builtOptions
        );

        if (!finishedCall.response.success) {
            logger.error({
                err: finishedCall.response,
                request: finishedCall.request,
                config,
            }, "Error while updating function definitions")
            return Promise.reject(finishedCall.response);
        }
    } catch (error) {
        logger.error({
            err: error,
            config,
        }, "Error while updating function definitions")
        return Promise.reject(error);
    }
    logger.debug("Updated function definitions")
}
