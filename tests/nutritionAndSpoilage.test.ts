import { describe, expect, it } from 'vitest';
import { createSeedDataset } from '../src/db/seedData';
import { DEFAULT_PRODUCTS, RECIPE_TEMPLATES } from '../src/domain/catalog';
import { InventoryBatch } from '../src/domain/types';
import { forecastAllProducts } from '../src/ml/depletionForecaster';
import {
  calculateProductNutrition,
  convertToBaseUnit,
  deductInventoryFifo,
} from '../src/ml/nutritionCalculator';
import { recommendZeroWasteMeals } from '../src/ml/spoilageAndMeals';

describe('Nutrition Calculator, FIFO Deduction & Zero-Waste Recommender', () => {
  const yogurt = DEFAULT_PRODUCTS.find((p) => p.id === 'prod_yogurt')!;
  const eggs = DEFAULT_PRODUCTS.find((p) => p.id === 'prod_eggs')!;

  it('converts units and calculates accurate calories and macros', () => {
    const grams = convertToBaseUnit(6, 'oz', yogurt);
    expect(grams).toBeCloseTo(170.1, 0);

    const nut = calculateProductNutrition(yogurt, 200);
    expect(nut.kcal).toBe(146);
    expect(nut.proteinG).toBeCloseTo(19.8, 1);

    const eggNut = calculateProductNutrition(eggs, 3);
    expect(eggNut.kcal).toBe(216);
    expect(eggNut.proteinG).toBeCloseTo(18.9, 1);
  });

  it('deducts inventory across multiple batches in strict FIFO (earliest expiry first) order', () => {
    const batches: InventoryBatch[] = [
      {
        id: 'later_batch',
        productId: yogurt.id,
        initialQty: 500,
        remainingQty: 500,
        unit: 'g',
        purchasedAt: '2026-11-18T10:00:00Z',
        expiresAt: '2026-11-30T12:00:00Z',
        storageLocation: 'fridge',
        unitCost: 6.49,
        status: 'active',
        updatedAt: '2026-11-18T10:00:00Z',
      },
      {
        id: 'earlier_batch',
        productId: yogurt.id,
        initialQty: 500,
        remainingQty: 120,
        unit: 'g',
        purchasedAt: '2026-11-12T10:00:00Z',
        expiresAt: '2026-11-21T12:00:00Z',
        storageLocation: 'fridge',
        unitCost: 6.49,
        status: 'active',
        updatedAt: '2026-11-12T10:00:00Z',
      },
    ];

    const res = deductInventoryFifo({
      batches,
      productId: yogurt.id,
      quantityToDeduct: 200,
      unit: 'g',
      source: 'meal_log',
      occurredAt: '2026-11-19T12:00:00Z',
      mealLogId: 'm1',
    });

    const earlier = res.updatedBatches.find((b) => b.id === 'earlier_batch')!;
    const later = res.updatedBatches.find((b) => b.id === 'later_batch')!;

    expect(earlier.remainingQty).toBe(0);
    expect(earlier.status).toBe('depleted');
    expect(later.remainingQty).toBe(420);
    expect(res.actualDeductedQty).toBe(200);
    expect(res.generatedEvents).toHaveLength(2);
  });

  it('ranks zero-waste meals that rescue expiring spinach/salmon/avocados highest', () => {
    const now = new Date('2026-11-19T12:00:00Z');
    const seed = createSeedDataset(now);
    const forecasts = forecastAllProducts(seed.products, seed.batches, seed.events, { now });

    const recs = recommendZeroWasteMeals({
      recipes: RECIPE_TEMPLATES,
      products: seed.products,
      forecasts,
      remainingKcalBudget: 750,
    });

    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].rescuedItems.length).toBeGreaterThan(0);
    expect(recs[0].nutrition.kcal).toBeGreaterThan(200);
  });
});
