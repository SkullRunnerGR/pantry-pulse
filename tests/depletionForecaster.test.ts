import { describe, expect, it } from 'vitest';
import { DEFAULT_PRODUCTS } from '../src/domain/catalog';
import { ConsumptionEvent, InventoryBatch } from '../src/domain/types';
import { addDays, forecastProductDepletion, getPriorDailyRate } from '../src/ml/depletionForecaster';

const milk = DEFAULT_PRODUCTS.find((p) => p.id === 'prod_milk')!;
const spinach = DEFAULT_PRODUCTS.find((p) => p.id === 'prod_spinach')!;

describe('Bayesian-EWMA Depletion Forecaster', () => {
  const now = new Date('2026-11-19T12:00:00Z');

  it('uses household-scaled cold-start prior when no consumption events exist', () => {
    const batch: InventoryBatch = {
      id: 'b1',
      productId: milk.id,
      initialQty: 1890,
      remainingQty: 1000,
      unit: 'ml',
      purchasedAt: addDays(now, -1).toISOString(),
      expiresAt: addDays(now, 10).toISOString(),
      storageLocation: 'fridge',
      unitCost: 5.99,
      status: 'active',
      updatedAt: now.toISOString(),
    };

    const single = forecastProductDepletion(milk, [batch], [], { now, householdSize: 1 });
    const family = forecastProductDepletion(milk, [batch], [], { now, householdSize: 4 });

    expect(single.dailyRateMean).toBeCloseTo(getPriorDailyRate(milk, 1), 1);
    expect(family.dailyRateMean).toBeGreaterThan(single.dailyRateMean * 2);
    expect(family.daysRemaining).toBeLessThan(single.daysRemaining);
    expect(single.confidenceScore).toBeLessThan(55);
  });

  it('converges toward personal EWMA rate and learns weekend seasonality', () => {
    const events: ConsumptionEvent[] = [];
    for (let d = -28; d <= -1; d++) {
      const dt = addDays(now, d);
      const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
      events.push({
        id: `e_${d}`,
        productId: milk.id,
        quantityDelta: isWeekend ? 600 : 250,
        unit: 'ml',
        source: 'meal_log',
        occurredAt: dt.toISOString(),
        dayOfWeek: dt.getDay(),
      });
    }

    const batch: InventoryBatch = {
      id: 'b2',
      productId: milk.id,
      initialQty: 1890,
      remainingQty: 700,
      unit: 'ml',
      purchasedAt: addDays(now, -2).toISOString(),
      expiresAt: addDays(now, 10).toISOString(),
      storageLocation: 'fridge',
      unitCost: 5.99,
      status: 'active',
      updatedAt: now.toISOString(),
    };

    const f = forecastProductDepletion(milk, [batch], events, { now, householdSize: 2 });

    expect(f.dailyRateMean).toBeGreaterThan(280);
    expect(f.dailyRateMean).toBeLessThan(430);
    // Weekend multipliers (Sun=0, Sat=6) should exceed weekday average
    expect(f.dowMultipliers[0]).toBeGreaterThan(f.dowMultipliers[2]);
    expect(f.dowMultipliers[6]).toBeGreaterThan(f.dowMultipliers[3]);
    // Uncertainty bounds must stay ordered
    expect(f.p10DaysRemaining).toBeLessThanOrEqual(f.daysRemaining);
    expect(f.p90DaysRemaining).toBeGreaterThanOrEqual(f.daysRemaining);
    expect(f.confidenceScore).toBeGreaterThan(70);
  });

  it('dampens one-off hosting spike outliers without blowing up daily velocity', () => {
    const baseEvents: ConsumptionEvent[] = [];
    for (let d = -14; d <= -1; d++) {
      const dt = addDays(now, d);
      baseEvents.push({
        id: `e_${d}`,
        productId: milk.id,
        quantityDelta: 240,
        unit: 'ml',
        source: 'meal_log',
        occurredAt: dt.toISOString(),
        dayOfWeek: dt.getDay(),
      });
    }
    const withSpike: ConsumptionEvent[] = [
      ...baseEvents,
      {
        id: 'e_spike',
        productId: milk.id,
        quantityDelta: 2400, // 10x party spike
        unit: 'ml',
        source: 'meal_log',
        occurredAt: addDays(now, -3).toISOString(),
        dayOfWeek: addDays(now, -3).getDay(),
      },
    ];

    const batch: InventoryBatch = {
      id: 'b3',
      productId: milk.id,
      initialQty: 1890,
      remainingQty: 1000,
      unit: 'ml',
      purchasedAt: now.toISOString(),
      expiresAt: addDays(now, 9).toISOString(),
      storageLocation: 'fridge',
      unitCost: 5.99,
      status: 'active',
      updatedAt: now.toISOString(),
    };

    const steady = forecastProductDepletion(milk, [batch], baseEvents, { now });
    const spiked = forecastProductDepletion(milk, [batch], withSpike, { now });

    // Dampening should prevent rate from doubling due to 1 spike day
    expect(spiked.dailyRateMean).toBeLessThan(steady.dailyRateMean * 1.45);
  });

  it('flags high dual-clock spoilage risk when expiry precedes predicted depletion', () => {
    const events: ConsumptionEvent[] = [];
    for (let d = -10; d <= -1; d++) {
      const dt = addDays(now, d);
      events.push({
        id: `s_${d}`,
        productId: spinach.id,
        quantityDelta: 30,
        unit: 'g',
        source: 'meal_log',
        occurredAt: dt.toISOString(),
        dayOfWeek: dt.getDay(),
      });
    }

    const expiringBatch: InventoryBatch = {
      id: 'b_exp',
      productId: spinach.id,
      initialQty: 284,
      remainingQty: 260,
      unit: 'g',
      purchasedAt: addDays(now, -4).toISOString(),
      expiresAt: addDays(now, 2).toISOString(),
      storageLocation: 'fridge',
      unitCost: 4.49,
      status: 'active',
      updatedAt: now.toISOString(),
    };

    const f = forecastProductDepletion(spinach, [expiringBatch], events, { now, householdSize: 1 });
    expect(f.spoilageRiskScore).toBeGreaterThan(0.45);
    expect(f.projectedWasteQty).toBeGreaterThan(100);
    expect(f.urgencyStatus).toBe('expiring');
  });
});
