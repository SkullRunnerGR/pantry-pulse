import {
  BaseUnit,
  ConsumptionEvent,
  InventoryBatch,
  MeasurementUnit,
  NutritionTotals,
  Product,
} from '../domain/types';

/**
 * Converts a user-supplied measurement into a product's canonical base unit ('g' | 'ml' | 'count').
 */
export function convertToBaseUnit(
  quantity: number,
  unit: MeasurementUnit,
  product: Pick<Product, 'defaultUnit' | 'servingSize'>
): number {
  if (quantity <= 0) return 0;

  if (unit === 'serving') {
    return round2(quantity * product.servingSize);
  }

  if (product.defaultUnit === 'count') {
    if (unit === 'count') return round2(quantity);
    return round2(quantity);
  }

  if (product.defaultUnit === 'g') {
    switch (unit) {
      case 'g':
        return round2(quantity);
      case 'kg':
        return round2(quantity * 1000);
      case 'oz':
        return round2(quantity * 28.3495);
      case 'lb':
        return round2(quantity * 453.592);
      case 'cup':
        return round2(quantity * 150);
      case 'tbsp':
        return round2(quantity * 15);
      case 'tsp':
        return round2(quantity * 5);
      case 'ml':
        return round2(quantity);
      case 'l':
        return round2(quantity * 1000);
      case 'fl_oz':
        return round2(quantity * 29.5735);
      case 'count':
        return round2(quantity * product.servingSize);
    }
  }

  // product.defaultUnit === 'ml'
  switch (unit) {
    case 'ml':
      return round2(quantity);
    case 'l':
      return round2(quantity * 1000);
    case 'fl_oz':
      return round2(quantity * 29.5735);
    case 'cup':
      return round2(quantity * 236.588);
    case 'tbsp':
      return round2(quantity * 14.7868);
    case 'tsp':
      return round2(quantity * 4.9289);
    case 'g':
      return round2(quantity);
    case 'kg':
      return round2(quantity * 1000);
    case 'oz':
      return round2(quantity * 29.5735);
    case 'lb':
      return round2(quantity * 453.592);
    case 'count':
      return round2(quantity * product.servingSize);
  }
}

/**
 * Calculates calories and macronutrients for a given quantity in the product's base unit.
 * For 'g' and 'ml', product macros are per 100 base units.
 * For 'count', product macros are per 1 unit.
 */
export function calculateProductNutrition(
  product: Pick<
    Product,
    'defaultUnit' | 'kcalPer100' | 'proteinPer100' | 'carbsPer100' | 'fatPer100' | 'fiberPer100'
  >,
  quantityInBaseUnit: number
): NutritionTotals {
  const safeQty = Math.max(0, quantityInBaseUnit);
  const factor = product.defaultUnit === 'count' ? safeQty : safeQty / 100;
  return {
    kcal: Math.round(product.kcalPer100 * factor),
    proteinG: round1(product.proteinPer100 * factor),
    carbsG: round1(product.carbsPer100 * factor),
    fatG: round1(product.fatPer100 * factor),
    fiberG: round1(product.fiberPer100 * factor),
  };
}

export function sumNutrition(items: NutritionTotals[]): NutritionTotals {
  return items.reduce<NutritionTotals>(
    (acc, item) => ({
      kcal: Math.round(acc.kcal + item.kcal),
      proteinG: round1(acc.proteinG + item.proteinG),
      carbsG: round1(acc.carbsG + item.carbsG),
      fatG: round1(acc.fatG + item.fatG),
      fiberG: round1(acc.fiberG + item.fiberG),
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 }
  );
}

export interface FifoDeductionResult {
  updatedBatches: InventoryBatch[];
  generatedEvents: ConsumptionEvent[];
  actualDeductedQty: number;
  unfulfilledQty: number;
}

/**
 * Deducts consumed quantity from active inventory batches in FIFO order (earliest expiresAt first).
 * Emits granular ConsumptionEvents for the ML depletion model.
 */
export function deductInventoryFifo(params: {
  batches: InventoryBatch[];
  productId: string;
  quantityToDeduct: number;
  unit: BaseUnit;
  source: ConsumptionEvent['source'];
  occurredAt: string;
  mealLogId?: string | null;
  idFactory?: () => string;
}): FifoDeductionResult {
  const {
    batches,
    productId,
    quantityToDeduct,
    unit,
    source,
    occurredAt,
    mealLogId = null,
    idFactory = () => `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  } = params;

  let remainingToDeduct = Math.max(0, quantityToDeduct);
  const dayOfWeek = new Date(occurredAt).getDay();
  const generatedEvents: ConsumptionEvent[] = [];

  // Sort candidate batch indices by soonest expiration date (FIFO / FEFO)
  const targetIndices = batches
    .map((b, idx) => ({ b, idx }))
    .filter(({ b }) => b.productId === productId && b.status === 'active' && b.remainingQty > 0)
    .sort((a, b) => a.b.expiresAt.localeCompare(b.b.expiresAt));

  const updatedBatches = batches.map((b) => ({ ...b }));
  let totalDeducted = 0;

  for (const { idx } of targetIndices) {
    if (remainingToDeduct <= 0.0001) break;
    const batch = updatedBatches[idx];
    const take = round2(Math.min(batch.remainingQty, remainingToDeduct));
    if (take <= 0) continue;

    batch.remainingQty = round2(Math.max(0, batch.remainingQty - take));
    if (batch.remainingQty <= 0.01) {
      batch.remainingQty = 0;
      batch.status = 'depleted';
    }
    batch.updatedAt = occurredAt;

    remainingToDeduct = round2(Math.max(0, remainingToDeduct - take));
    totalDeducted = round2(totalDeducted + take);

    generatedEvents.push({
      id: idFactory(),
      productId,
      batchId: batch.id,
      mealLogId,
      quantityDelta: take,
      unit,
      source,
      occurredAt,
      dayOfWeek,
    });
  }

  // If user logged consumption of an item whose tracked pantry stock was 0,
  // still record an unlinked consumption event so the ML rate learns true demand.
  if (totalDeducted === 0 && quantityToDeduct > 0) {
    generatedEvents.push({
      id: idFactory(),
      productId,
      batchId: null,
      mealLogId,
      quantityDelta: round2(quantityToDeduct),
      unit,
      source,
      occurredAt,
      dayOfWeek,
    });
  }

  return {
    updatedBatches,
    generatedEvents,
    actualDeductedQty: totalDeducted,
    unfulfilledQty: round2(remainingToDeduct),
  };
}

export function formatQuantity(qty: number, unit: BaseUnit): string {
  if (unit === 'count') {
    const rounded = Math.round(qty * 10) / 10;
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} ct`;
  }
  if (unit === 'g' && qty >= 1000) {
    return `${(qty / 1000).toFixed(2).replace(/\.?0+$/, '')} kg`;
  }
  if (unit === 'ml' && qty >= 1000) {
    return `${(qty / 1000).toFixed(2).replace(/\.?0+$/, '')} L`;
  }
  return `${Math.round(qty)} ${unit}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
