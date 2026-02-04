/** 库存食材状态：新鲜 / 即将过期 / 已过期 */
export type IngredientStatus = "fresh" | "expiring_soon" | "expired";

export type InventoryItem = {
  id: string;
  name: string;
  quantity?: string;
  expiryHint?: string;
  status: IngredientStatus;
  imageUrl?: string;
};

export type Recipe = {
  id: string;
  name: string;
  ingredients: string[];
  steps: string[];
  tags: string[];
  timeMinutes?: number;
};

export type RecipeCardDisplay = Recipe & {
  matchedIngredients?: string[];
  reason?: string;
};
