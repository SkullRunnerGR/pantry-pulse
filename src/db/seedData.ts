import { DEFAULT_PRODUCTS } from '../domain/catalog';
import {
  ConsumptionEvent,
  InventoryBatch,
  MealLog,
  Product,
  ReceiptRecord,
  ShoppingListItem,
  UserProfile,
} from '../domain/types';
import { addDays } from '../ml/depletionForecaster';
import { calculateProductNutrition, sumNutrition } from '../ml/nutritionCalculator';

export interface SeedDataset {
  profile: UserProfile;
  products: Product[];
  batches: InventoryBatch[];
  events: ConsumptionEvent[];
  meals: MealLog[];
  receipts: ReceiptRecord[];
  manualShoppingItems: ShoppingListItem[];
}

function isoAtHour(baseDate: Date, dayOffset: number, hour: number): string {
  const d = addDays(baseDate, dayOffset);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
}

/**
 * Generates a realistic 21-day household history so the ML depletion forecaster,
 * weekend seasonality multipliers, spoilage risk radar, and smart trip scheduler
 * immediately demonstrate high-signal predictions on first launch.
 */
export function createSeedDataset(now = new Date()): SeedDataset {
  const profile: UserProfile = {
    id: 'user_primary',
    name: 'Alex',
    householdSize: 2,
    dailyCalorieGoal: 2150,
    proteinGoalG: 145,
    carbsGoalG: 225,
    fatGoalG: 70,
    fiberGoalG: 32,
    preferredShopDays: [3, 6], // Wednesday & Saturday
    shopLookaheadDays: 6,
    minTripIntervalDays: 5,
    remindersEnabled: true,
    reminderHour: 9,
    updatedAt: now.toISOString(),
  };

  const products = DEFAULT_PRODUCTS.map((p) => ({ ...p, updatedAt: now.toISOString() }));
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Active & realistic pantry inventory batches with varied urgency:
  // - Milk & Eggs & Espresso: running low critically (1-2 days left)
  // - Baby Spinach & Salmon: expiring soon with high spoilage risk (rescue candidates!)
  // - Blueberries, Yogurt, Chicken, Avocados, Bread, Oat Milk: mid-cycle (3-6 days left)
  // - Oats, Rice, Olive Oil, Almonds: healthy pantry staples
  const batches: InventoryBatch[] = [
    {
      id: 'batch_milk_1',
      productId: 'prod_milk',
      initialQty: 1890,
      remainingQty: 420,
      unit: 'ml',
      purchasedAt: isoAtHour(now, -5, 11),
      expiresAt: isoAtHour(now, 5, 12),
      storageLocation: 'fridge',
      unitCost: 5.99,
      status: 'active',
      updatedAt: now.toISOString(),
    },
    {
      id: 'batch_eggs_1',
      productId: 'prod_eggs',
      initialQty: 12,
      remainingQty: 3,
      unit: 'count',
      purchasedAt: isoAtHour(now, -6, 11),
      expiresAt: isoAtHour(now, 16, 12),
      storageLocation: 'fridge',
      unitCost: 6.99,
      status: 'active',
      updatedAt: now.toISOString(),
    },
    {
      id: 'batch_spinach_1',
      productId: 'prod_spinach',
      initialQty: 284,
      remainingQty: 215,
      unit: 'g',
      purchasedAt: isoAtHour(now, -4, 17),
      expiresAt: isoAtHour(now, 2, 12),
      storageLocation: 'fridge',
      unitCost: 4.49,
      status: 'active',
      updatedAt: now.toISOString(),
    },
    {
      id: 'batch_salmon_1',
      productId: 'prod_salmon',
      initialQty: 680,
      remainingQty: 360,
      unit: 'g',
      purchasedAt: isoAtHour(now, -2, 18),
      expiresAt: isoAtHour(now, 2, 12),
      storageLocation: 'fridge',
      unitCost: 14.99,
      status: 'active',
      updatedAt: now.toISOString(),
    },
    {
      id: 'batch_yogurt_1',
      productId: 'prod_yogurt',
      initialQty: 907,
      remainingQty: 540,
      unit: 'g',
      purchasedAt: isoAtHour(now, -3, 11),
      expiresAt: isoAtHour(now, 10, 12),
      storageLocation: 'fridge',
      unitCost: 6.49,
      status: 'active',
      updatedAt: now.toISOString(),
    },
    {
      id: 'batch_blueberries_1',
      productId: 'prod_blueberries',
      initialQty: 340,
      remainingQty: 190,
      unit: 'g',
      purchasedAt: isoAtHour(now, -4, 17),
      expiresAt: isoAtHour(now, 3, 12),
      storageLocation: 'fridge',
      unitCost: 4.99,
      status: 'active',
      updatedAt: now.toISOString(),
    },
    {
      id: 'batch_avocado_1',
      productId: 'prod_avocado',
      initialQty: 4,
      remainingQty: 2.5,
      unit: 'count',
      purchasedAt: isoAtHour(now, -3, 17),
      expiresAt: isoAtHour(now, 2, 12),
      storageLocation: 'pantry',
      unitCost: 5.49,
      status: 'active',
      updatedAt: now.toISOString(),
    },
    {
      id: 'batch_bananas_1',
      productId: 'prod_bananas',
      initialQty: 6,
      remainingQty: 2,
      unit: 'count',
      purchasedAt: isoAtHour(now, -4, 11),
      expiresAt: isoAtHour(now, 2, 12),
      storageLocation: 'pantry',
      unitCost: 2.29,
      status: 'active',
      updatedAt: now.toISOString(),
    },
    {
      id: 'batch_chicken_1',
      productId: 'prod_chicken',
      initialQty: 907,
      remainingQty: 520,
      unit: 'g',
      purchasedAt: isoAtHour(now, -2, 17),
      expiresAt: isoAtHour(now, 4, 12),
      storageLocation: 'fridge',
      unitCost: 9.99,
      status: 'active',
      updatedAt: now.toISOString(),
    },
    {
      id: 'batch_bread_1',
      productId: 'prod_bread',
      initialQty: 16,
      remainingQty: 6,
      unit: 'count',
      purchasedAt: isoAtHour(now, -4, 11),
      expiresAt: isoAtHour(now, 4, 12),
      storageLocation: 'pantry',
      unitCost: 5.79,
      status: 'active',
      updatedAt: now.toISOString(),
    },
    {
      id: 'batch_coffee_1',
      productId: 'prod_coffee',
      initialQty: 340,
      remainingQty: 68,
      unit: 'g',
      purchasedAt: isoAtHour(now, -10, 10),
      expiresAt: isoAtHour(now, 50, 12),
      storageLocation: 'pantry',
      unitCost: 15.5,
      status: 'active',
      updatedAt: now.toISOString(),
    },
    {
      id: 'batch_oat_milk_1',
      productId: 'prod_oat_milk',
      initialQty: 946,
      remainingQty: 310,
      unit: 'ml',
      purchasedAt: isoAtHour(now, -4, 11),
      expiresAt: isoAtHour(now, 6, 12),
      storageLocation: 'fridge',
      unitCost: 4.99,
      status: 'active',
      updatedAt: now.toISOString(),
    },
    {
      id: 'batch_oats_1',
      productId: 'prod_oats',
      initialQty: 907,
      remainingQty: 640,
      unit: 'g',
      purchasedAt: isoAtHour(now, -12, 11),
      expiresAt: isoAtHour(now, 165, 12),
      storageLocation: 'pantry',
      unitCost: 5.49,
      status: 'active',
      updatedAt: now.toISOString(),
    },
    {
      id: 'batch_rice_1',
      productId: 'prod_rice',
      initialQty: 907,
      remainingQty: 720,
      unit: 'g',
      purchasedAt: isoAtHour(now, -14, 11),
      expiresAt: isoAtHour(now, 210, 12),
      storageLocation: 'pantry',
      unitCost: 4.99,
      status: 'active',
      updatedAt: now.toISOString(),
    },
    {
      id: 'batch_olive_oil_1',
      productId: 'prod_olive_oil',
      initialQty: 750,
      remainingQty: 490,
      unit: 'ml',
      purchasedAt: isoAtHour(now, -25, 11),
      expiresAt: isoAtHour(now, 310, 12),
      storageLocation: 'pantry',
      unitCost: 13.99,
      status: 'active',
      updatedAt: now.toISOString(),
    },
    {
      id: 'batch_almonds_1',
      productId: 'prod_almonds',
      initialQty: 454,
      remainingQty: 290,
      unit: 'g',
      purchasedAt: isoAtHour(now, -9, 11),
      expiresAt: isoAtHour(now, 130, 12),
      storageLocation: 'pantry',
      unitCost: 7.49,
      status: 'active',
      updatedAt: now.toISOString(),
    },
  ];

  // Generate 21 days of realistic consumption events with clear day-of-week patterns
  // (e.g., heavier eggs/coffee/sourdough on Sat/Sun brunch, steady yogurt/milk on weekdays)
  const events: ConsumptionEvent[] = [];
  let evtSeq = 1;

  const scheduleSpecs: Array<{
    productId: string;
    weekdayQty: number;
    weekendQty: number;
    skipMod?: number;
  }> = [
    { productId: 'prod_milk', weekdayQty: 260, weekendQty: 340 },
    { productId: 'prod_eggs', weekdayQty: 2, weekendQty: 4 },
    { productId: 'prod_yogurt', weekdayQty: 170, weekendQty: 130, skipMod: 5 },
    { productId: 'prod_coffee', weekdayQty: 36, weekendQty: 54 },
    { productId: 'prod_oat_milk', weekdayQty: 180, weekendQty: 240, skipMod: 6 },
    { productId: 'prod_spinach', weekdayQty: 65, weekendQty: 50, skipMod: 3 },
    { productId: 'prod_blueberries', weekdayQty: 60, weekendQty: 85, skipMod: 3 },
    { productId: 'prod_avocado', weekdayQty: 0.5, weekendQty: 1, skipMod: 2 },
    { productId: 'prod_bananas', weekdayQty: 1, weekendQty: 1.5 },
    { productId: 'prod_chicken', weekdayQty: 180, weekendQty: 240, skipMod: 2 },
    { productId: 'prod_salmon', weekdayQty: 160, weekendQty: 200, skipMod: 4 },
    { productId: 'prod_bread', weekdayQty: 2, weekendQty: 4 },
    { productId: 'prod_oats', weekdayQty: 50, weekendQty: 40, skipMod: 3 },
    { productId: 'prod_rice', weekdayQty: 85, weekendQty: 110, skipMod: 3 },
    { productId: 'prod_olive_oil', weekdayQty: 15, weekendQty: 25 },
    { productId: 'prod_almonds', weekdayQty: 28, weekendQty: 20, skipMod: 3 },
  ];

  for (let dayOffset = -21; dayOffset <= -1; dayOffset++) {
    const dt = addDays(now, dayOffset);
    const dow = dt.getDay();
    const isWeekend = dow === 0 || dow === 6;

    for (const spec of scheduleSpecs) {
      if (spec.skipMod && Math.abs(dayOffset + spec.productId.length) % spec.skipMod === 0) {
        continue;
      }
      const product = productMap.get(spec.productId);
      if (!product) continue;

      // Deterministic subtle variation +/-10%
      const jitter = 0.92 + ((Math.abs(dayOffset * 7 + evtSeq) % 5) * 0.04);
      const baseQty = isWeekend ? spec.weekendQty : spec.weekdayQty;
      const qty =
        product.defaultUnit === 'count'
          ? Math.max(0.5, Math.round(baseQty * 2) / 2)
          : Math.round(baseQty * jitter);

      events.push({
        id: `evt_seed_${evtSeq++}`,
        productId: spec.productId,
        batchId: null,
        mealLogId: null,
        quantityDelta: qty,
        unit: product.defaultUnit,
        source: 'meal_log',
        occurredAt: isoAtHour(now, dayOffset, isWeekend ? 10 : 8),
        dayOfWeek: dow,
      });
    }
  }

  // Helper to construct meal logs with exact macro calculations
  const buildMeal = (
    id: string,
    mealType: MealLog['mealType'],
    title: string,
    dayOffset: number,
    hour: number,
    ingredients: Array<{ productId: string; quantity: number }>
  ): MealLog => {
    const items = ingredients.map((ing, i) => {
      const prod = productMap.get(ing.productId)!;
      const nut = calculateProductNutrition(prod, ing.quantity);
      return {
        id: `${id}_item_${i}`,
        mealLogId: id,
        productId: prod.id,
        name: prod.name,
        quantity: ing.quantity,
        unit: prod.defaultUnit,
        kcal: nut.kcal,
        proteinG: nut.proteinG,
        carbsG: nut.carbsG,
        fatG: nut.fatG,
        fiberG: nut.fiberG,
      };
    });
    const totals = sumNutrition(items);
    const loggedAt = isoAtHour(now, dayOffset, hour);
    return {
      id,
      userId: profile.id,
      mealType,
      title,
      loggedAt,
      items,
      totalKcal: totals.kcal,
      totalProteinG: totals.proteinG,
      totalCarbsG: totals.carbsG,
      totalFatG: totals.fatG,
      totalFiberG: totals.fiberG,
      updatedAt: loggedAt,
    };
  };

  // Seed today's breakfast & lunch + previous 4 days of meals for calorie trend chart
  const meals: MealLog[] = [
    buildMeal('meal_today_1', 'breakfast', 'Blueberry Greek Yogurt & Espresso', 0, 8, [
      { productId: 'prod_yogurt', quantity: 185 },
      { productId: 'prod_blueberries', quantity: 75 },
      { productId: 'prod_oats', quantity: 45 },
      { productId: 'prod_oat_milk', quantity: 150 },
      { productId: 'prod_coffee', quantity: 18 },
    ]),
    buildMeal('meal_today_2', 'lunch', 'Seared Chicken & Avocado Rice Bowl', 0, 12, [
      { productId: 'prod_chicken', quantity: 190 },
      { productId: 'prod_rice', quantity: 85 },
      { productId: 'prod_spinach', quantity: 70 },
      { productId: 'prod_avocado', quantity: 0.5 },
      { productId: 'prod_olive_oil', quantity: 10 },
    ]),
    buildMeal('meal_yest_1', 'breakfast', 'Avocado Egg Sourdough Toast', -1, 8, [
      { productId: 'prod_bread', quantity: 2 },
      { productId: 'prod_eggs', quantity: 3 },
      { productId: 'prod_avocado', quantity: 0.5 },
      { productId: 'prod_milk', quantity: 240 },
    ]),
    buildMeal('meal_yest_2', 'lunch', 'Greek Yogurt Banana Power Bowl', -1, 13, [
      { productId: 'prod_yogurt', quantity: 220 },
      { productId: 'prod_bananas', quantity: 1 },
      { productId: 'prod_oats', quantity: 55 },
      { productId: 'prod_almonds', quantity: 30 },
    ]),
    buildMeal('meal_yest_3', 'dinner', 'Wild Sockeye Salmon & Brown Rice', -1, 19, [
      { productId: 'prod_salmon', quantity: 190 },
      { productId: 'prod_rice', quantity: 90 },
      { productId: 'prod_spinach', quantity: 85 },
      { productId: 'prod_olive_oil', quantity: 15 },
    ]),
    buildMeal('meal_d2_1', 'breakfast', 'Oat & Berry Recovery Smoothie', -2, 8, [
      { productId: 'prod_milk', quantity: 260 },
      { productId: 'prod_yogurt', quantity: 150 },
      { productId: 'prod_bananas', quantity: 1 },
      { productId: 'prod_oats', quantity: 60 },
    ]),
    buildMeal('meal_d2_2', 'dinner', 'Chicken Sourdough & Greens', -2, 18, [
      { productId: 'prod_chicken', quantity: 220 },
      { productId: 'prod_bread', quantity: 2 },
      { productId: 'prod_avocado', quantity: 1 },
      { productId: 'prod_almonds', quantity: 35 },
    ]),
  ];

  // Add today's consumption events too so today's meals reflect in ML events
  for (const meal of meals.filter((m) => m.id.startsWith('meal_today_'))) {
    for (const item of meal.items) {
      if (!item.productId) continue;
      events.push({
        id: `evt_seed_${evtSeq++}`,
        productId: item.productId,
        batchId: null,
        mealLogId: meal.id,
        quantityDelta: item.quantity,
        unit: item.unit,
        source: 'meal_log',
        occurredAt: meal.loggedAt,
        dayOfWeek: new Date(meal.loggedAt).getDay(),
      });
    }
  }

  const receipts: ReceiptRecord[] = [
    {
      id: 'rcpt_seed_1',
      merchantName: "Trader Joe's #142",
      purchasedAt: isoAtHour(now, -4, 17),
      subtotal: 41.24,
      tax: 0,
      total: 41.24,
      rawOcrText: 'TRADER JOES #142\nORG BBY SPNCH 10OZ 4.49\nFRESH BLBRY 12OZ 4.99\nHASS AVOC 4CT 5.49\nORG GRK YGRT 32OZ 6.49\nBNLS CHKN BRST 2LB 9.99\nPAST LRG EGGS 1DZ 6.99\nORG BAN 6CT 2.29',
      parsedItemCount: 7,
    },
  ];

  return {
    profile,
    products,
    batches,
    events,
    meals,
    receipts,
    manualShoppingItems: [],
  };
}
