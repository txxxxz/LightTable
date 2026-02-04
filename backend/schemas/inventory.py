from enum import Enum
from pydantic import BaseModel


class InventoryStatus(str, Enum):
    fresh = "fresh"
    expiring_soon = "expiring_soon"
    expired = "expired"


class InventoryItem(BaseModel):
    id: str
    name: str
    quantity: str | None = None
    expiry_hint: str | None = None
    status: InventoryStatus = InventoryStatus.fresh
    image_url: str | None = None
