import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { z, type ZodTypeAny } from "zod";
import { Identifier } from "../src/decorators/meta.dec";
import { Schema } from "../src/decorators/datatype.dec";
import { dataTypeMap } from "../src/map/datatype.map";

describe("dataTypeMap type generation", () => {
    it("inlines plain schemas", () => {
        @Identifier("PlainType")
        @Schema(z.object({ name: z.string() }))
        class PlainType {}

        expect(dataTypeMap(PlainType).type).toBe("{ name: string; }");
    });

    it("resolves mutually recursive schemas by identifier regardless of registration order", () => {
        const OrderSchema: ZodTypeAny = z.lazy(() =>
            z.object({ addresses: z.array(AddressSchema) })
        );
        const AddressSchema: ZodTypeAny = z.lazy(() =>
            z.object({ order: OrderSchema })
        );

        @Identifier("MutualOrder")
        @Schema(OrderSchema)
        class MutualOrder {}

        @Identifier("MutualAddress")
        @Schema(AddressSchema)
        class MutualAddress {}

        const orderDef = dataTypeMap(MutualOrder);
        const addressDef = dataTypeMap(MutualAddress);

        expect(orderDef.type).toBe("{ addresses: MutualAddress[]; }");
        expect(addressDef.type).toBe("{ order: MutualOrder; }");
    });

    it("references itself by identifier for self-recursive schemas", () => {
        const NodeSchema: ZodTypeAny = z.lazy(() =>
            z.object({ children: z.array(NodeSchema) })
        );

        @Identifier("TreeNode")
        @Schema(NodeSchema)
        class TreeNode {}

        expect(dataTypeMap(TreeNode).type).toBe("{ children: TreeNode[]; }");
    });

    it("prints registered schemas embedded in other types as identifier references", () => {
        const ItemSchema: ZodTypeAny = z.lazy(() =>
            z.object({ related: z.array(ItemSchema) })
        );

        @Identifier("EmbeddedItem")
        @Schema(ItemSchema)
        class EmbeddedItem {}

        @Identifier("ItemPayload")
        @Schema(z.object({ item: ItemSchema, count: z.number() }))
        class ItemPayload {}

        dataTypeMap(EmbeddedItem);
        const payloadDef = dataTypeMap(ItemPayload);

        expect(payloadDef.type).toBe("{ item: EmbeddedItem; count: number; }");
    });

    it("throws a helpful error when a recursive schema is not registered as a data type", () => {
        const LoopSchema: ZodTypeAny = z.lazy(() =>
            z.object({ next: LoopSchema })
        );

        @Identifier("BrokenPayload")
        @Schema(z.object({ loop: LoopSchema }))
        class BrokenPayload {}

        const def = dataTypeMap(BrokenPayload);
        expect(() => def.type).toThrow(/BrokenPayload.*recursive/i);
    });
});
