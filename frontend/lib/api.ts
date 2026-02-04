/**
 * 后端 API 调用封装
 */
import type { InventoryItem, Recipe, RecipeCardDisplay } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

// ============ 后端返回类型（snake_case）============

type ApiInventoryItem = {
  id: string;
  name: string;
  quantity?: string;
  expiry_hint?: string;
  status: "fresh" | "expiring_soon" | "expired";
  image_url?: string;
};

type ApiRecipePlan = {
  recipe_id: string;
  name: string;
  matched_ingredients: string[];
  time_minutes?: number;
  reason: string;
};

type ApiRecipeHit = {
  recipe_id: string;
  title: string;
  snippet: string;
  tags: string[];
  time_minutes?: number;
  score: number;
  matched_ingredients: string[];
};

type ApiRecommendResponse = {
  request_id: string;
  profile_summary: string;
  refined_query: string;
  plans: ApiRecipePlan[];
  retrieval: ApiRecipeHit[];
};

type ApiRecipe = {
  id: string;
  name: string;
  ingredients: string[];
  steps: string[];
  tags: string[];
  time_minutes?: number;
};

// ============ 转换函数 ============

function toInventoryItem(api: ApiInventoryItem): InventoryItem {
  return {
    id: api.id,
    name: api.name,
    quantity: api.quantity,
    expiryHint: api.expiry_hint,
    status: api.status,
    imageUrl: api.image_url,
  };
}

function toApiInventoryItem(item: InventoryItem): ApiInventoryItem {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    expiry_hint: item.expiryHint,
    status: item.status,
    image_url: item.imageUrl,
  };
}

function toRecipe(api: ApiRecipe): Recipe {
  return {
    id: api.id,
    name: api.name,
    ingredients: api.ingredients,
    steps: api.steps,
    tags: api.tags,
    timeMinutes: api.time_minutes,
  };
}

// ============ 导出类型 ============

export type RecommendResult = {
  requestId: string;
  profileSummary: string;
  refinedQuery: string;
  plans: RecipeCardDisplay[];
};

// ============ API 调用 ============

export async function getInventory(userId: string): Promise<InventoryItem[]> {
  const res = await fetch(`${API_BASE}/api/v1/inventory/${userId}`);
  if (!res.ok) throw new Error("Failed to get inventory");
  const data = await res.json();
  return (data.items || []).map(toInventoryItem);
}

export async function addInventoryItems(
  userId: string,
  items: InventoryItem[]
): Promise<void> {
  const apiItems = items.map(toApiInventoryItem);
  const res = await fetch(`${API_BASE}/api/v1/inventory/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, items: apiItems }),
  });
  if (!res.ok) throw new Error("Failed to add items");
}

export async function deleteInventoryItem(
  userId: string,
  itemId: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/inventory/${userId}/${itemId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete item");
}

export async function recommend(
  userId: string,
  inventory: string[],
  tags: string[]
): Promise<RecommendResult> {
  const res = await fetch(`${API_BASE}/api/v1/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, inventory, tags }),
  });
  if (!res.ok) throw new Error("Failed to get recommendations");
  const data: ApiRecommendResponse = await res.json();
  
  // 转换为前端格式
  const plans: RecipeCardDisplay[] = data.plans.map((p) => ({
    id: p.recipe_id,
    name: p.name,
    ingredients: [],
    steps: [],
    tags: [],
    timeMinutes: p.time_minutes,
    matchedIngredients: p.matched_ingredients,
    reason: p.reason,
  }));

  return {
    requestId: data.request_id,
    profileSummary: data.profile_summary,
    refinedQuery: data.refined_query,
    plans,
  };
}

export async function sendFeedback(
  userId: string,
  signal: "like" | "dislike" | "goal_update" | "constraint_update",
  recipeId?: string,
  note?: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      recipe_id: recipeId,
      signal,
      note,
    }),
  });
  if (!res.ok) throw new Error("Failed to send feedback");
}

export async function getRecipe(recipeId: string): Promise<Recipe> {
  const res = await fetch(`${API_BASE}/api/v1/recipe/${recipeId}`);
  if (!res.ok) throw new Error("Recipe not found");
  const data: ApiRecipe = await res.json();
  return toRecipe(data);
}

export async function getApiStatus(): Promise<{
  openrouter_configured: boolean;
  mem0_configured: boolean;
}> {
  const res = await fetch(`${API_BASE}/api/v1/status`);
  if (!res.ok) throw new Error("Failed to get status");
  return res.json();
}
