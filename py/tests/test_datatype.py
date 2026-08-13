"""Port of ``ts/test/datatype.test.ts`` — Pydantic-based data types."""
from typing import List, Optional

import pytest

from hercules import Identifier, Schema
from hercules.schema import BaseModel
from hercules.map.datatype import data_type_map


def test_inlines_plain_schemas():
    class Plain(BaseModel):
        name: str

    @Identifier("PlainType")
    @Schema(Plain)
    class PlainType:
        pass

    assert data_type_map(PlainType).type == "{ name: string; }"


def test_resolves_mutually_recursive_schemas_by_identifier():
    class Order(BaseModel):
        addresses: List["Address"]

    class Address(BaseModel):
        order: "Order"

    Order.model_rebuild()
    Address.model_rebuild()

    @Identifier("MutualOrder")
    @Schema(Order)
    class MutualOrder:
        pass

    @Identifier("MutualAddress")
    @Schema(Address)
    class MutualAddress:
        pass

    order_def = data_type_map(MutualOrder)
    address_def = data_type_map(MutualAddress)

    assert order_def.type == "{ addresses: MutualAddress[]; }"
    assert address_def.type == "{ order: MutualOrder; }"


def test_references_itself_for_self_recursive_schemas():
    class Node(BaseModel):
        children: List["Node"]

    Node.model_rebuild()

    @Identifier("TreeNode")
    @Schema(Node)
    class TreeNode:
        pass

    assert data_type_map(TreeNode).type == "{ children: TreeNode[]; }"


def test_prints_registered_schemas_as_identifier_references():
    class Item(BaseModel):
        related: List["Item"]

    Item.model_rebuild()

    @Identifier("EmbeddedItem")
    @Schema(Item)
    class EmbeddedItem:
        pass

    class Payload(BaseModel):
        item: Item
        count: int

    @Identifier("ItemPayload")
    @Schema(Payload)
    class ItemPayload:
        pass

    data_type_map(EmbeddedItem)
    payload_def = data_type_map(ItemPayload)

    assert payload_def.type == "{ item: EmbeddedItem; count: number; }"


def test_throws_for_unregistered_recursive_schema():
    class Loop(BaseModel):
        next: Optional["Loop"] = None

    Loop.model_rebuild()

    class Broken(BaseModel):
        loop: Loop

    @Identifier("BrokenPayload")
    @Schema(Broken)
    class BrokenPayload:
        pass

    definition = data_type_map(BrokenPayload)
    with pytest.raises(ValueError, match=r"BrokenPayload.*recursive"):
        _ = definition.type


def test_type_string_override_is_used_verbatim():
    from hercules import TypeString

    class Ignored(BaseModel):
        whatever: str

    @Identifier("OVERRIDDEN")
    @TypeString("{ a: number; b: EMAIL; }")
    @Schema(Ignored)
    class Overridden:
        pass

    assert data_type_map(Overridden).type == "{ a: number; b: EMAIL; }"
