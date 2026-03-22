from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class InventoryStatus(str, Enum):
    fresh = "fresh"
    expiring_soon = "expiring_soon"
    expired = "expired"


class StorageType(str, Enum):
    fridge = "fridge"
    freezer = "freezer"
    pantry = "pantry"


class SourceType(str, Enum):
    manual_text = "manual_text"
    manual_form = "manual_form"
    image = "image"
    receipt = "receipt"


class InventoryItem(BaseModel):
    id: str
    display_name: str
    normalized_name: str
    category: str
    quantity_text: str
    unit: str | None = None
    storage_type: StorageType = StorageType.fridge
    date_added: str
    estimated_expiry_date: str
    status: InventoryStatus = InventoryStatus.fresh
    source_type: SourceType = SourceType.manual_text
    image_url: str | None = None


class InventoryCandidateInput(BaseModel):
    display_name: str
    quantity_text: str = "1份"
    category: str | None = None
    storage_type: StorageType | None = None
    source_type: SourceType = SourceType.manual_text
    date_added: str | None = None
    image_url: str | None = None


class InventoryCandidateResponse(BaseModel):
    items: list[InventoryItem]


class InventoryListResponse(BaseModel):
    items: list[InventoryItem]


class AddInventoryItemsRequest(BaseModel):
    user_id: str
    items: list[InventoryCandidateInput]


class UpdateInventoryItemRequest(BaseModel):
    display_name: str | None = None
    quantity_text: str | None = None
    category: str | None = None
    storage_type: StorageType | None = None
    date_added: str | None = None


class ParseInventoryTextRequest(BaseModel):
    user_id: str
    text: str = Field(..., min_length=1)


class ShoppingListItem(BaseModel):
    id: str
    display_name: str
    normalized_name: str
    category: str
    quantity_text: str | None = None
    recommended_quantity_text: str | None = None
    reason: str
    priority: str
    source: str
    checked: bool = False


class ShoppingListResponse(BaseModel):
    items: list[ShoppingListItem]


class ShoppingListManualAddRequest(BaseModel):
    user_id: str
    display_name: str
    normalized_name: str | None = None
    category: str | None = None
    quantity_text: str | None = None
    recommended_quantity_text: str | None = None
    reason: str
    priority: str = "optional"


class ShoppingListCandidateInput(BaseModel):
    display_name: str
    normalized_name: str | None = None
    category: str | None = None
    quantity_text: str | None = None
    recommended_quantity_text: str | None = None
    reason: str = "自然语言补货"
    priority: str = "optional"


class AddShoppingListItemsRequest(BaseModel):
    user_id: str
    items: list[ShoppingListCandidateInput]


class ShoppingListUpdateRequest(BaseModel):
    checked: bool


class AddShoppingItemsToInventoryRequest(BaseModel):
    user_id: str
    item_ids: list[str] = Field(default_factory=list)


class AddShoppingItemsToInventoryResponse(BaseModel):
    moved_count: int
    inventory_items: list[InventoryItem]
    shopping_items: list[ShoppingListItem]
