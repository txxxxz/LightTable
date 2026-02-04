"""
库存相关 API（前端库存页使用）
"""
from fastapi import APIRouter
from pydantic import BaseModel

from backend.schemas.inventory import InventoryItem, InventoryStatus

router = APIRouter(prefix="/api/v1/inventory", tags=["inventory"])

# 内存中的库存存储（简化版，后续可接数据库）
_user_inventories: dict[str, list[InventoryItem]] = {}


class AddItemsRequest(BaseModel):
    user_id: str
    items: list[InventoryItem]


class AddItemsResponse(BaseModel):
    ok: bool
    count: int


class InventoryListResponse(BaseModel):
    items: list[InventoryItem]


@router.get("/{user_id}", response_model=InventoryListResponse)
async def get_inventory(user_id: str) -> InventoryListResponse:
    """获取用户库存列表"""
    items = _user_inventories.get(user_id, [])
    return InventoryListResponse(items=items)


@router.post("/add", response_model=AddItemsResponse)
async def add_items(request: AddItemsRequest) -> AddItemsResponse:
    """添加食材到库存"""
    if request.user_id not in _user_inventories:
        _user_inventories[request.user_id] = []
    _user_inventories[request.user_id].extend(request.items)
    return AddItemsResponse(ok=True, count=len(request.items))


@router.delete("/{user_id}/{item_id}")
async def delete_item(user_id: str, item_id: str) -> dict:
    """删除库存中的食材"""
    if user_id in _user_inventories:
        _user_inventories[user_id] = [
            i for i in _user_inventories[user_id] if i.id != item_id
        ]
    return {"ok": True}
