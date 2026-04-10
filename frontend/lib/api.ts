import type {
  InventoryItem,
  RecommendationPlan,
  Recipe,
  ShoppingListItem,
  UserProfileResponse,
  VideoReference,
  WeeklyPlanDay,
  WeeklyRecommendResponse,
} from "./types";
import { normalizeInventoryCategory } from "./inventory-categories";

const API_BASE = "/api/backend";

class ApiError extends Error {
  status: number;
  detail?: string;

  constructor(message: string, status = 0, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function apiFetch(path: string, init?: RequestInit) {
  const url = `${API_BASE}${path}`;
  try {
    return await fetch(url, init);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ApiError(`Failed to fetch ${url}: ${reason}`, 0, reason);
  }
}

async function assertOk(res: Response, fallbackMessage: string) {
  if (res.ok) return;

  let detail = "";
  try {
    const data = await res.json();
    detail = data?.detail || JSON.stringify(data);
  } catch {
    try {
      detail = await res.text();
  } catch {
      detail = "";
    }
  }

  detail = detail.replace(/[:：]\s*$/, "").trim();

  throw new ApiError(
    detail ? `${fallbackMessage}: ${detail}` : fallbackMessage,
    res.status,
    detail
  );
}

type ApiInventoryItem = {
  id: string;
  display_name: string;
  normalized_name: string;
  category: string;
  quantity_text: string;
  unit?: string | null;
  storage_type: InventoryItem["storageType"];
  date_added: string;
  estimated_expiry_date: string;
  status: InventoryItem["status"];
  source_type: InventoryItem["sourceType"];
  image_url?: string | null;
  macros?: {
    carbs_g?: number | null;
    protein_g?: number | null;
    fat_g?: number | null;
    estimated: boolean;
  } | null;
};

type ApiPlan = {
  plan_id: string;
  label: string;
  dishes: { recipe_id: string; title: string }[];
  matched_inventory: string[];
  missing_ingredients: string[];
  time_minutes?: number | null;
  difficulty: string;
  fit_tags: string[];
  reason: string;
};

type ApiShoppingListItem = {
  id: string;
  display_name: string;
  normalized_name: string;
  category: string;
  quantity_text?: string | null;
  recommended_quantity_text?: string | null;
  reason: string;
  priority: string;
  source: string;
  checked: boolean;
};

type ApiRecipe = {
  id: string;
  name: string;
  ingredients: string[];
  core_ingredients: string[];
  optional_ingredients: string[];
  steps: string[];
  tags: string[];
  time_minutes?: number;
  difficulty: string;
  nutrition_tags: string[];
  allergen_tags: string[];
  constraint_tags: string[];
  matched_inventory: string[];
  missing_ingredients: string[];
  video_reference?: {
    provider: string;
    title: string;
    url: string;
    available: boolean;
  } | null;
};

type ApiRecommendResponse = {
  request_id: string;
  profile_summary: string;
  strategy_summary: string;
  plans: ApiPlan[];
  shopping_suggestions: ApiShoppingListItem[];
};

type ApiWeeklyPlanDay = {
  day_label: string;
  focus: string;
  training_hint: string;
  plan: ApiPlan;
};

type ApiWeeklyRecommendResponse = {
  status: "ready" | "needs_ingredients";
  request_id: string;
  profile_summary: string;
  strategy_summary: string;
  days: ApiWeeklyPlanDay[];
  shopping_suggestions: ApiShoppingListItem[];
  required_ingredients: ApiShoppingListItem[];
  blocking_reasons: string[];
};

function toInventoryItem(item: ApiInventoryItem): InventoryItem {
  return {
    id: item.id,
    displayName: item.display_name,
    normalizedName: item.normalized_name,
    category: normalizeInventoryCategory(item.category),
    quantityText: item.quantity_text,
    unit: item.unit,
    storageType: item.storage_type,
    dateAdded: item.date_added,
    estimatedExpiryDate: item.estimated_expiry_date,
    status: item.status,
    sourceType: item.source_type,
    imageUrl: item.image_url,
    macros: item.macros
      ? {
          carbsG: item.macros.carbs_g,
          proteinG: item.macros.protein_g,
          fatG: item.macros.fat_g,
          estimated: item.macros.estimated,
        }
      : null,
  };
}

function fromInventoryInput(item: {
  displayName: string;
  quantityText: string;
  category?: InventoryItem["category"];
  storageType?: InventoryItem["storageType"];
  sourceType?: InventoryItem["sourceType"];
  dateAdded?: string;
  imageUrl?: string | null;
}) {
  return {
    display_name: item.displayName,
    quantity_text: item.quantityText,
    category: item.category,
    storage_type: item.storageType,
    source_type: item.sourceType || "manual_form",
    date_added: item.dateAdded,
    image_url: item.imageUrl,
  };
}

function toPlan(plan: ApiPlan): RecommendationPlan {
  return {
    planId: plan.plan_id,
    label: plan.label,
    dishes: plan.dishes.map((dish) => ({
      recipeId: dish.recipe_id,
      title: dish.title,
    })),
    matchedInventory: plan.matched_inventory,
    missingIngredients: plan.missing_ingredients,
    timeMinutes: plan.time_minutes,
    difficulty: plan.difficulty,
    fitTags: plan.fit_tags,
    reason: plan.reason,
  };
}

function toShoppingItem(item: ApiShoppingListItem): ShoppingListItem {
  return {
    id: item.id,
    displayName: item.display_name,
    normalizedName: item.normalized_name,
    category: normalizeInventoryCategory(item.category),
    quantityText: item.quantity_text,
    recommendedQuantityText: item.recommended_quantity_text,
    reason: item.reason,
    priority: item.priority,
    source: item.source,
    checked: item.checked,
  };
}

function toRecipe(recipe: ApiRecipe): Recipe {
  return {
    id: recipe.id,
    name: recipe.name,
    ingredients: recipe.ingredients,
    coreIngredients: recipe.core_ingredients,
    optionalIngredients: recipe.optional_ingredients,
    steps: recipe.steps,
    tags: recipe.tags,
    timeMinutes: recipe.time_minutes,
    difficulty: recipe.difficulty,
    nutritionTags: recipe.nutrition_tags,
    allergenTags: recipe.allergen_tags,
    constraintTags: recipe.constraint_tags,
    matchedInventory: recipe.matched_inventory,
    missingIngredients: recipe.missing_ingredients,
    videoReference: recipe.video_reference
      ? ({
          provider: recipe.video_reference.provider,
          title: recipe.video_reference.title,
          url: recipe.video_reference.url,
          available: recipe.video_reference.available,
        } satisfies VideoReference)
      : null,
  };
}

function toWeeklyPlanDay(day: ApiWeeklyPlanDay): WeeklyPlanDay {
  return {
    dayLabel: day.day_label,
    focus: day.focus,
    trainingHint: day.training_hint,
    plan: toPlan(day.plan),
  };
}

export async function getInventory(userId: string): Promise<InventoryItem[]> {
  const res = await apiFetch(`/api/v1/inventory/${userId}`);
  await assertOk(res, "Failed to load inventory");
  const data = await res.json();
  return (data.items || []).map(toInventoryItem);
}

export async function parseInventoryText(userId: string, text: string): Promise<InventoryItem[]> {
  const res = await apiFetch(`/api/v1/inventory/parse-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, text }),
  });
  await assertOk(res, "Failed to parse text");
  const data = await res.json();
  return (data.items || []).map(toInventoryItem);
}

export async function recognizeInventory(
  userId: string,
  file: File,
  sourceType: "image" | "receipt"
): Promise<InventoryItem[]> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch(
    `/api/v1/inventory/recognize?user_id=${encodeURIComponent(
      userId
    )}&source_type=${sourceType}`,
    {
      method: "POST",
      body: form,
    }
  );
  await assertOk(res, "Failed to recognize inventory");
  const data = await res.json();
  return (data.items || []).map(toInventoryItem);
}

export async function saveInventoryItems(
  userId: string,
  items: Array<{
    displayName: string;
    quantityText: string;
    category?: InventoryItem["category"];
    storageType?: InventoryItem["storageType"];
    sourceType?: InventoryItem["sourceType"];
    dateAdded?: string;
    imageUrl?: string | null;
  }>
): Promise<InventoryItem[]> {
  const res = await apiFetch(`/api/v1/inventory/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      items: items.map(fromInventoryInput),
    }),
  });
  await assertOk(res, "Failed to save inventory");
  const data = await res.json();
  return (data.items || []).map(toInventoryItem);
}

export async function updateInventoryItem(
  userId: string,
  itemId: string,
  updates: Partial<Pick<InventoryItem, "displayName" | "quantityText" | "category" | "storageType" | "dateAdded">>
): Promise<InventoryItem> {
  const payload = {
    display_name: updates.displayName,
    quantity_text: updates.quantityText,
    category: updates.category,
    storage_type: updates.storageType,
    date_added: updates.dateAdded,
  };
  const res = await apiFetch(
    `/api/v1/inventory/items/${itemId}?user_id=${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  await assertOk(res, "Failed to update inventory item");
  return toInventoryItem(await res.json());
}

export async function deleteInventoryItem(userId: string, itemId: string): Promise<void> {
  const res = await apiFetch(
    `/api/v1/inventory/items/${itemId}?user_id=${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
    }
  );
  await assertOk(res, "Failed to delete inventory item");
}

export async function recommend(
  userId: string,
  tags: string[],
  context?: Record<string, unknown>
): Promise<{
  requestId: string;
  profileSummary: string;
  strategySummary: string;
  plans: RecommendationPlan[];
  shoppingSuggestions: ShoppingListItem[];
}> {
  const res = await apiFetch(`/api/v1/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      tags,
      context,
    }),
  });
  await assertOk(res, "Failed to get recommendations");
  const data: ApiRecommendResponse = await res.json();
  return {
    requestId: data.request_id,
    profileSummary: data.profile_summary,
    strategySummary: data.strategy_summary,
    plans: data.plans.map(toPlan),
    shoppingSuggestions: data.shopping_suggestions.map(toShoppingItem),
  };
}

export async function recommendWeekly(
  userId: string,
  tags: string[],
  context?: Record<string, unknown>
): Promise<WeeklyRecommendResponse> {
  const res = await apiFetch(`/api/v1/recommend/weekly`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      tags,
      context,
    }),
  });
  await assertOk(res, "Failed to get weekly recommendations");
  const data: ApiWeeklyRecommendResponse = await res.json();
  return {
    status: data.status,
    requestId: data.request_id,
    profileSummary: data.profile_summary,
    strategySummary: data.strategy_summary,
    days: data.days.map(toWeeklyPlanDay),
    shoppingSuggestions: data.shopping_suggestions.map(toShoppingItem),
    requiredIngredients: data.required_ingredients.map(toShoppingItem),
    blockingReasons: data.blocking_reasons,
  };
}

export async function sendFeedback(
  userId: string,
  signal: "view" | "skip" | "start" | "complete" | "like" | "dislike" | "goal_update" | "constraint_update",
  recipeId?: string,
  note?: string,
  tags: string[] = [],
  payload?: Record<string, unknown>
): Promise<void> {
  const res = await apiFetch(`/api/v1/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      recipe_id: recipeId,
      signal,
      note,
      tags,
      payload,
    }),
  });
  await assertOk(res, "Failed to send feedback");
}

export async function getRecipe(recipeId: string, userId: string): Promise<Recipe> {
  const res = await apiFetch(
    `/api/v1/recipe/${recipeId}?user_id=${encodeURIComponent(userId)}`
  );
  await assertOk(res, "Recipe not found");
  return toRecipe(await res.json());
}

export async function getRecipeVideoReference(recipeId: string): Promise<VideoReference> {
  const res = await apiFetch(`/api/v1/recipe/${recipeId}/video-reference`);
  await assertOk(res, "Video reference not found");
  return await res.json();
}

export async function completeRecipe(
  recipeId: string,
  userId: string,
  usageMode: "all" | "half" | "custom",
  notes?: string
): Promise<{
  ok: boolean;
  message: string;
  shopping_suggestions: ApiShoppingListItem[];
}> {
  const res = await apiFetch(`/api/v1/recipe/${recipeId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      usage_mode: usageMode,
      notes,
    }),
  });
  await assertOk(res, "Failed to complete recipe");
  return await res.json();
}

export async function getShoppingList(userId: string): Promise<ShoppingListItem[]> {
  const res = await apiFetch(`/api/v1/shopping-list/${userId}`);
  await assertOk(res, "Failed to load shopping list");
  const data = await res.json();
  return (data.items || []).map(toShoppingItem);
}

export async function addSelectedShoppingItemsToInventory(
  userId: string,
  itemIds: string[]
): Promise<{
  movedCount: number;
  inventoryItems: InventoryItem[];
  shoppingItems: ShoppingListItem[];
}> {
  const res = await apiFetch(`/api/v1/shopping-list/add-to-inventory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      item_ids: itemIds,
    }),
  });
  await assertOk(res, "Failed to add shopping items to inventory");
  const data = await res.json();
  return {
    movedCount: data.moved_count || 0,
    inventoryItems: (data.inventory_items || []).map(toInventoryItem),
    shoppingItems: (data.shopping_items || []).map(toShoppingItem),
  };
}

export async function updateShoppingListItem(
  userId: string,
  itemId: string,
  checked: boolean
): Promise<ShoppingListItem> {
  const res = await apiFetch(
    `/api/v1/shopping-list/items/${itemId}?user_id=${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked }),
    }
  );
  await assertOk(res, "Failed to update shopping item");
  return toShoppingItem(await res.json());
}

export async function addManualShoppingItem(
  userId: string,
  displayName: string,
  reason: string,
  quantityText?: string,
  normalizedName?: string,
  category?: ShoppingListItem["category"],
  recommendedQuantityText?: string
): Promise<ShoppingListItem> {
  const res = await apiFetch(`/api/v1/shopping-list/manual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      display_name: displayName,
      normalized_name: normalizedName,
      category,
      quantity_text: quantityText,
      recommended_quantity_text: recommendedQuantityText,
      reason,
    }),
  });
  await assertOk(res, "Failed to add shopping item");
  return toShoppingItem(await res.json());
}

export async function saveShoppingListItems(
  userId: string,
  items: Array<{
    displayName: string;
    normalizedName?: string;
    category?: ShoppingListItem["category"];
    quantityText?: string;
    recommendedQuantityText?: string;
    reason?: string;
  }>
): Promise<ShoppingListItem[]> {
  const res = await apiFetch(`/api/v1/shopping-list/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      items: items.map((item) => ({
        display_name: item.displayName,
        normalized_name: item.normalizedName,
        category: item.category,
        quantity_text: item.quantityText,
        recommended_quantity_text: item.recommendedQuantityText,
        reason: item.reason || "自然语言补货",
      })),
    }),
  });
  await assertOk(res, "Failed to save shopping list");
  const data = await res.json();
  return (data.items || []).map(toShoppingItem);
}

export async function getUserProfile(userId: string): Promise<UserProfileResponse> {
  const res = await apiFetch(`/api/v1/user/profile?user_id=${encodeURIComponent(userId)}`);
  await assertOk(res, "Failed to load user profile");
  return await res.json();
}

export async function patchBodyProfile(
  userId: string,
  payload: Partial<UserProfileResponse["profile"]>
): Promise<void> {
  const res = await apiFetch(`/api/v1/user/profile?user_id=${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await assertOk(res, "Failed to update profile");
}

export async function updatePreference(
  userId: string,
  type: string,
  value: string | string[],
  action?: "add" | "remove" | "set"
): Promise<void> {
  const res = await apiFetch(
    `/api/v1/user/preference/update?user_id=${encodeURIComponent(userId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, value, action }),
    }
  );
  await assertOk(res, "Failed to update preference");
}

export async function patchSystemSettings(
  userId: string,
  payload: Partial<UserProfileResponse["system"]>
): Promise<void> {
  const res = await apiFetch(`/api/v1/user/system?user_id=${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await assertOk(res, "Failed to update system settings");
}

export async function getApiStatus(): Promise<{
  openrouter_configured: boolean;
  mem0_configured: boolean;
}> {
  const res = await apiFetch(`/api/v1/status`);
  await assertOk(res, "Failed to get status");
  return await res.json();
}
