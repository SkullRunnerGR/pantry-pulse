import { describe, expect, it } from 'vitest';
import { createSeedDataset } from '../src/db/seedData';
import { forecastAllProducts } from '../src/ml/depletionForecaster';
import { buildSmartShoppingPlan } from '../src/ml/shoppingScheduler';

describe('Smart Shopping Trip Scheduler', () => {
  const now = new Date('2026-11-19T12:00:00Z'); // Thursday

  it('consolidates critical and upcoming items and aligns with preferred shopping days', () => {
    const seed = createSeedDataset(now);
    const forecasts = forecastAllProducts(seed.products, seed.batches, seed.events, {
      now,
      householdSize: seed.profile.householdSize,
    });

    // Prefer Friday (5) and Sunday (0)
    const profile = { ...seed.profile, preferredShopDays: [0, 5] };
    const plan = buildSmartShoppingPlan({
      products: seed.products,
      forecasts,
      profile,
      now,
    });

    expect(plan.criticalCount).toBeGreaterThan(0);
    expect(plan.items.length).toBeGreaterThanOrEqual(plan.criticalCount);
    expect(plan.estimatedTotal).toBeGreaterThan(0);
    // Should schedule on Friday (offset 1) before critical items stock out
    expect(plan.daysUntilTrip).toBeLessThanOrEqual(2);
    // Verify critical items are sorted ahead of upcoming items
    const firstUpcomingIdx = plan.items.findIndex((i) => i.priority === 'upcoming');
    const lastCriticalIdx = [...plan.items].reverse().findIndex((i) => i.priority === 'critical');
    if (firstUpcomingIdx !== -1 && lastCriticalIdx !== -1) {
      const actualLastCritical = plan.items.length - 1 - lastCriticalIdx;
      expect(actualLastCritical).toBeLessThan(firstUpcomingIdx);
    }
  });

  it('caps recommended quantities so short-shelf-life perishables are not overbought', () => {
    const seed = createSeedDataset(now);
    const forecasts = forecastAllProducts(seed.products, seed.batches, seed.events, {
      now,
      householdSize: 2,
    });

    const plan = buildSmartShoppingPlan({
      products: seed.products,
      forecasts,
      profile: { ...seed.profile, minTripIntervalDays: 14 }, // long cycle
      now,
    });

    const bananaItem = plan.items.find((i) => i.productId === 'prod_bananas');
    if (bananaItem) {
      // Bananas have 6-day shelf life -> shouldn't recommend 4 huge bunches
      expect(bananaItem.packagesToBuy).toBeLessThanOrEqual(2);
    }
  });
});
