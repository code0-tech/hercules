import type {SdkState} from "../../types";
import {TransferRequest} from "@code0-tech/tucana/aquila";
import {logger} from "../../logger";

export async function handleLogon(state: SdkState, config: {
    authToken: string;
    aquilaUrl: string;
    actionId: string;
    version: string
}) {
    await state.stream!.requests.send(
        TransferRequest.create({
                data: {
                    oneofKind: "logon",
                    logon: {
                        actionIdentifier: config.actionId,
                        version: config.version,
                        actionConfigurations: state.configurationDefinitions
                    }
                }
            }
        ),
    ).catch(reason => {
        logger.error({
            err: reason,
            config,
        }, "Failed to send logon request")
        return Promise.reject(reason);
    })

    logger.debug("Successfully sent logon request")
}
