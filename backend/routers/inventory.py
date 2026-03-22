from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from backend.core.config import (
    RATE_LIMIT_PARSE_TEXT_PER_HOUR,
    RATE_LIMIT_RECOGNIZE_PER_HOUR,
)
from backend.core.rate_limit import rate_limit
from backend.database import (
    add_manual_shopping_item,
    add_shopping_items_to_inventory,
    delete_inventory_item,
    list_inventory,
    list_shopping_list_items,
    update_inventory_item,
    update_shopping_list_item,
    upsert_inventory_items,
)
from backend.schemas.inventory import (
    AddInventoryItemsRequest,
    AddShoppingItemsToInventoryRequest,
    AddShoppingItemsToInventoryResponse,
    AddShoppingListItemsRequest,
    InventoryCandidateResponse,
    InventoryItem,
    InventoryListResponse,
    ParseInventoryTextRequest,
    ShoppingListItem,
    ShoppingListManualAddRequest,
    ShoppingListResponse,
    ShoppingListUpdateRequest,
    UpdateInventoryItemRequest,
)
from backend.services.ingredient_service import (
    build_inventory_candidate,
    enrich_candidates_with_categories,
    ensure_category_key,
    ImageRecognitionError,
    normalize_ingredient_name,
    parse_freeform_inventory_text,
    recognize_from_uploaded_file,
)

router = APIRouter(prefix="/api/v1", tags=["inventory"])
parse_inventory_text_rate_limit = rate_limit(
    "inventory_parse_text",
    limit=RATE_LIMIT_PARSE_TEXT_PER_HOUR,
    window_seconds=3600,
)
recognize_inventory_rate_limit = rate_limit(
    "inventory_recognize",
    limit=RATE_LIMIT_RECOGNIZE_PER_HOUR,
    window_seconds=3600,
)


def _to_inventory_schema(item: dict) -> InventoryItem:
    return InventoryItem(**item)


@router.get("/inventory/{user_id}", response_model=InventoryListResponse)
async def get_inventory(user_id: str) -> InventoryListResponse:
    return InventoryListResponse(items=[_to_inventory_schema(item) for item in list_inventory(user_id)])


@router.post(
    "/inventory/parse-text",
    response_model=InventoryCandidateResponse,
    dependencies=[Depends(parse_inventory_text_rate_limit)],
)
async def parse_inventory_text(request: ParseInventoryTextRequest) -> InventoryCandidateResponse:
    items = await enrich_candidates_with_categories(parse_freeform_inventory_text(request.text))
    return InventoryCandidateResponse(items=[_to_inventory_schema(item) for item in items])


@router.post(
    "/inventory/recognize",
    response_model=InventoryCandidateResponse,
    dependencies=[Depends(recognize_inventory_rate_limit)],
)
async def recognize_inventory(
    user_id: str = Query(...),
    source_type: str = Query("image"),
    file: UploadFile = File(...),
) -> InventoryCandidateResponse:
    del user_id
    file_bytes = await file.read()
    try:
        items = await recognize_from_uploaded_file(
            file_bytes,
            file.filename or "upload.jpg",
            source_type=source_type,
        )
    except ImageRecognitionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"图片识别失败: {exc}") from exc
    return InventoryCandidateResponse(items=[_to_inventory_schema(item) for item in items])


@router.post("/inventory/items", response_model=InventoryListResponse)
async def save_inventory_items(request: AddInventoryItemsRequest) -> InventoryListResponse:
    normalized = [
        build_inventory_candidate(
            item.display_name,
            quantity_text=item.quantity_text,
            category=item.category,
            storage_type=item.storage_type.value if item.storage_type else None,
            source_type=item.source_type.value,
            date_added=item.date_added,
            image_url=item.image_url,
        )
        for item in request.items
    ]
    upsert_inventory_items(request.user_id, normalized)
    return InventoryListResponse(items=[_to_inventory_schema(item) for item in list_inventory(request.user_id)])


@router.patch("/inventory/items/{item_id}", response_model=InventoryItem)
async def patch_inventory_item(
    item_id: str,
    request: UpdateInventoryItemRequest,
    user_id: str = Query(...),
) -> InventoryItem:
    updated = update_inventory_item(
        user_id,
        item_id,
        {
            key: value.value if hasattr(value, "value") else value
            for key, value in request.model_dump(exclude_none=True).items()
        },
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    return _to_inventory_schema(updated)


@router.delete("/inventory/items/{item_id}")
async def remove_inventory_item(item_id: str, user_id: str = Query(...)) -> dict[str, bool]:
    deleted = delete_inventory_item(user_id, item_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    return {"ok": True}


@router.get("/shopping-list/{user_id}", response_model=ShoppingListResponse)
async def get_shopping_list(user_id: str) -> ShoppingListResponse:
    return ShoppingListResponse(items=[ShoppingListItem(**item) for item in list_shopping_list_items(user_id)])


@router.patch("/shopping-list/items/{item_id}", response_model=ShoppingListItem)
async def patch_shopping_list_item(
    item_id: str,
    request: ShoppingListUpdateRequest,
    user_id: str = Query(...),
) -> ShoppingListItem:
    updated = update_shopping_list_item(user_id, item_id, checked=request.checked)
    if updated is None:
        raise HTTPException(status_code=404, detail="Shopping item not found")
    return ShoppingListItem(**updated)


@router.post("/shopping-list/manual", response_model=ShoppingListItem)
async def add_shopping_item(request: ShoppingListManualAddRequest) -> ShoppingListItem:
    item = add_manual_shopping_item(
        request.user_id,
        display_name=request.display_name,
        normalized_name=request.normalized_name or normalize_ingredient_name(request.display_name),
        category=ensure_category_key(request.category, raw_name=request.display_name),
        quantity_text=request.quantity_text,
        recommended_quantity_text=request.recommended_quantity_text,
        reason=request.reason,
        priority=request.priority,
    )
    return ShoppingListItem(**item)


@router.post("/shopping-list/items", response_model=ShoppingListResponse)
async def save_shopping_list_items(request: AddShoppingListItemsRequest) -> ShoppingListResponse:
    saved_items = [
        add_manual_shopping_item(
            request.user_id,
            display_name=item.display_name,
            normalized_name=item.normalized_name or normalize_ingredient_name(item.display_name),
            category=ensure_category_key(item.category, raw_name=item.display_name),
            quantity_text=item.quantity_text,
            recommended_quantity_text=item.recommended_quantity_text,
            reason=item.reason,
            priority=item.priority,
        )
        for item in request.items
    ]
    del saved_items
    return ShoppingListResponse(items=[ShoppingListItem(**item) for item in list_shopping_list_items(request.user_id)])


@router.post("/shopping-list/add-to-inventory", response_model=AddShoppingItemsToInventoryResponse)
async def add_selected_shopping_items_to_inventory(
    request: AddShoppingItemsToInventoryRequest,
) -> AddShoppingItemsToInventoryResponse:
    inventory_items, shopping_items, moved_count = add_shopping_items_to_inventory(
        request.user_id,
        item_ids=request.item_ids or None,
    )
    return AddShoppingItemsToInventoryResponse(
        moved_count=moved_count,
        inventory_items=[_to_inventory_schema(item) for item in inventory_items],
        shopping_items=[ShoppingListItem(**item) for item in shopping_items],
    )
