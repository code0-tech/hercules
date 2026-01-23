import {FlowType} from "@code0-tech/tucana/pb/shared.flow_definition_pb.js";
import {DefinitionDataType} from "@code0-tech/tucana/pb/shared.data_type_pb.js";
import {RuntimeFunctionDefinition} from "@code0-tech/tucana/pb/shared.runtime_function_pb.js";
import {Struct, Value} from "@code0-tech/tucana/pb/shared.struct_pb.js";


type ActionSdk = {
    config: {
        token: string,
        actionUrl: string,
        actionId: string,
        version: string,
    },
    connect: () => Promise<void>, // after register
    registerDataType: (dataType: Omit<DefinitionDataType, "actionIdentifier">) => Promise<void>,
    registerFlowType: (flowType: Omit<FlowType, "actionIdentifier">) => Promise<void>,
    registerFunctionDefinition: (functionDefinition: Omit<RuntimeFunctionDefinition, "actionIdentifier">, handler: (parameters: Struct) => Promise<Value | void | null | undefined>) => Promise<void>,
    dispatchEvent: (eventType: string, payload: object) => Promise<void>,
}

export const createSdk = (config: ActionSdk["config"]): ActionSdk => {
    return {
        config
    }
}