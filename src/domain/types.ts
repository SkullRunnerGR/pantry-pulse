export type BaseUnit = 'g' | 'ml' | 'count';

export type MeasurementUnit =
  | 'g'
  | 'kg'
  | 'oz'
  | 'lb'
  | 'ml'
  | 'l'
  | 'fl_oz'
  | 'cup'
  | 'tbsp'
  | 'tsp'
  | 'count'
  | 'serving';

export type FoodCategory =
  | 'produce'
  | 'dairy'
  | 'protein'
  | 'grains'
  | 'pantry'
  | 'beverages'
  | 'frozen'
  | 'snacks'
  | 'bakery';

export type StorageLocation = 'fridge' | 'pantry' | 'freezer';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type BatchStatus = 'active' | 'depleted' | 'spoiled';

export type ConsumptionSource =
  | 'meal_log'
  | 'quick_use'
  | 'stock_adjustment'
  | 'marked_empty'
  | 'spoiled';

export type ShoppingPriority = 'critical' | 'upcoming' | 'optional';

export interface UserProfile {
  id: string;
  name: string;
  householdSize: number;
  dailyCalorieGoal: number;
  proteinGoalG: number;
  carbsGoalG: number;
  fatGoalG: number;
  fiberGoalG: number;
  /** 0 = Sunday .. 6 = Saturday */
  preferredShopDays: number[];
  shopLookaheadDays: number;
  minTripIntervalDays: number;
  remindersEnabled: boolean;
  reminderHour: number;
  updatedAt: string;
}

export interface Product {
  id: string;
  barcode?: string | null;
  name: string;
  brand?: string | null;
  category: FoodCategory;
  defaultUnit: BaseUnit;
  /** Standard retail package size in defaultUnit */
  defaultPackageQty: number;
  /** Typical single serving size in defaultUnit */
  servingSize: number;
  servingLabel: string;
  /** Nutrition per 100 base units (or per 1 count when defaultUnit === 'count') */
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  fiberPer100: number;
  defaultShelfLifeDays: number;
  storageLocation: StorageLocation;
  avgUnitPrice: number;
  aisle: string;
  isStaple: boolean;
  updatedAt: string;
}

export interface InventoryBatch {
  id: string;
  productId: string;
  receiptId?: string | null;
  initialQty: number;
  remainingQty: number;
  unit: BaseUnit;
  purchasedAt: string; // ISO date string
  expiresAt: string;   // ISO date string
  storageLocation: StorageLocation;
  unitCost: number;
  status: BatchStatus;
  updatedAt: string;
}

export interface NutritionTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface MealItem {
  id: string;
  mealLogId: string;
  productId?: string | null;
  name: string;
  quantity: number;
  unit: BaseUnit;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface MealLog {
  id: string;
  userId: string;
  mealType: MealType;
  title: string;
  loggedAt: string; // ISO timestamp
  items: MealItem[];
  totalKcal: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  totalFiberG: number;
  notes?: string;
  updatedAt: string;
}

export interface ConsumptionEvent {
  id: string;
  productId: string;
  batchId?: string | null;
  mealLogId?: string | null;
  quantityDelta: number; // positive number consumed in product's base unit
  unit: BaseUnit;
  source: ConsumptionSource;
  occurredAt: string; // ISO timestamp
  dayOfWeek: number;  // 0 (Sun) - 6 (Sat)
}

export interface ConsumptionForecast {
  productId: string;
  currentStock: number;
  unit: BaseUnit;
  /** Learned daily consumption rate in base unit/day */
  dailyRateMean: number;
  dailyRateStd: number;
  /** Normalized 7-element array (Sun..Sat) averaging to 1.0 */
  dowMultipliers: number[];
  /** Number of active observation days backing this forecast */
  observationDays: number;
  /** Expected days until depletion (P50) */
  daysRemaining: number;
  /** Earliest likely days remaining (P10, faster usage) */
  p10DaysRemaining: number;
  /** Latest likely days remaining (P90, slower usage) */
  p90DaysRemaining: number;
  predictedDepletionDate: string; // YYYY-MM-DD
  p10DepletionDate: string;
  p90DepletionDate: string;
  /** 0 - 100 confidence score */
  confidenceScore: number;
  /** Safety stock buffer in days */
  safetyStockDays: number;
  /** Recommended date to reorder before stockout */
  reorderDate: string; // YYYY-MM-DD
  daysUntilReorder: number;
  /** Dual-clock spoilage analytics */
  earliestExpiryDate: string | null;
  daysUntilEarliestExpiry: number | null;
  spoilageRiskScore: number; // 0 - 1
  projectedWasteQty: number;
  urgencyStatus: 'out' | 'critical' | 'low' | 'expiring' | 'healthy';
  computedAt: string;
}

export interface ShoppingListItem {
  id: string;
  tripId: string;
  productId?: string | null;
  name: string;
  category: FoodCategory;
  aisle: string;
  recommendedQty: number;
  packagesToBuy: number;
  unit: BaseUnit;
  priority: ShoppingPriority;
  reason: string;
  estimatedPrice: number;
  isChecked: boolean;
  source: 'predicted' | 'manual';
}

export interface ShoppingTripPlan {
  id: string;
  scheduledDate: string; // YYYY-MM-DD
  daysUntilTrip: number;
  reason: string;
  criticalCount: number;
  upcomingCount: number;
  estimatedTotal: number;
  items: ShoppingListItem[];
  reminderDate: string; // ISO timestamp for notification
  status: 'scheduled' | 'completed';
}

export interface ReceiptRecord {
  id: string;
  merchantName: string;
  purchasedAt: string;
  subtotal: number;
  tax: number;
  total: number;
  rawOcrText: string;
  parsedItemCount: number;
}

export interface ParsedReceiptLine {
  id: string;
  rawLine: string;
  normalizedName: string;
  matchedProductId: string | null;
  matchedProductName: string | null;
  matchConfidence: number; // 0 - 1
  quantity: number;
  unit: BaseUnit;
  price: number;
  category: FoodCategory;
  storageLocation: StorageLocation;
  estimatedShelfLifeDays: number;
  kcalPer100: number;
  selected: boolean;
}

export interface ParsedReceipt {
  merchantName: string;
  purchasedAt: string;
  subtotal: number;
  tax: number;
  total: number;
  lines: ParsedReceiptLine[];
}

export interface RecipeTemplate {
  id: string;
  title: string;
  mealType: MealType;
  prepMinutes: number;
  description: string;
  ingredients: Array<{
    productId: string;
    quantity: number;
    unit: BaseUnit;
  }>;
}

export interface ZeroWasteMealRecommendation {
  recipe: RecipeTemplate;
  score: number; // 0 - 100
  rescuedItems: Array<{
    productId: string;
    productName: string;
    daysUntilExpiry: number;
    spoilageRiskScore: number;
  }>;
  pantryCoverageRatio: number;
  nutrition: NutritionTotals;
  fitsRemainingCalories: boolean;
}
