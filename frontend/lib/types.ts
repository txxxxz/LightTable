export type IngredientStatus = "fresh" | "expiring_soon" | "expired";
export type StorageType = "fridge" | "freezer" | "pantry";
export type SourceType = "manual_text" | "manual_form" | "image" | "receipt";
export type Goal = "fat_loss" | "maintain" | "muscle_gain";
export type CookingLevel = "survival" | "home_cook" | "chef";
export type InventoryCategory =
  | "dairy"
  | "vegetables_tofu"
  | "meat_poultry_eggs"
  | "seafood"
  | "pantry_condiments"
  | "dry_goods"
  | "baking_dairy"
  | "ready_meals"
  | "beverages"
  | "fruit_snacks";

export type InventoryItem = {
  id: string;
  displayName: string;
  normalizedName: string;
  category: InventoryCategory;
  quantityText: string;
  unit?: string | null;
  storageType: StorageType;
  dateAdded: string;
  estimatedExpiryDate: string;
  status: IngredientStatus;
  sourceType: SourceType;
  imageUrl?: string | null;
};

export type ShoppingListItem = {
  id: string;
  displayName: string;
  normalizedName: string;
  category: InventoryCategory;
  quantityText?: string | null;
  recommendedQuantityText?: string | null;
  reason: string;
  priority: string;
  source: string;
  checked: boolean;
};

export type RecommendationPlan = {
  planId: string;
  label: string;
  dishes: { recipeId: string; title: string }[];
  matchedInventory: string[];
  missingIngredients: string[];
  timeMinutes?: number | null;
  difficulty: string;
  fitTags: string[];
  reason: string;
};

export type VideoReference = {
  provider: string;
  title: string;
  url: string;
  available: boolean;
};

export type Recipe = {
  id: string;
  name: string;
  ingredients: string[];
  coreIngredients: string[];
  optionalIngredients: string[];
  steps: string[];
  tags: string[];
  timeMinutes?: number;
  difficulty: string;
  nutritionTags: string[];
  allergenTags: string[];
  constraintTags: string[];
  matchedInventory: string[];
  missingIngredients: string[];
  videoReference?: VideoReference | null;
};

export type UserProfileResponse = {
  profile: {
    height: number;
    weight: number;
    goal: Goal;
    household_size: number;
    time_budget_minutes: number;
    purchase_frequency_per_week: number;
  };
  preferences: {
    dislikes: string[];
    level: CookingLevel;
    flavors: string[];
    cuisines: string[];
    methods: string[];
    health_constraints: string[];
    kitchen_tools: string[];
  };
  system: {
    expiry_alert: boolean;
    debug_mode: boolean;
  };
};
