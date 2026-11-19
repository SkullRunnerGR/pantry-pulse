import {
  ConsumptionForecast,
  Product,
  ShoppingListItem,
  ShoppingPriority,
  ShoppingTripPlan,
  UserProfile,
} from '../domain/types';
import { addDays, toDateKey } from './depletionForecaster';

export interface SchedulerInput {
  products: Product[];
  forecasts: Record<string, ConsumptionForecast>;
  profile: UserProfile;
  manualItems?: ShoppingListItem[];
  checkedMap?: Record<string, boolean>;
  now?: Date;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Generates the optimal upcoming grocery shopping trip date and dynamic shopping list:
 * 1. Consolidates items whose ML reorder dates fall within the user's lookahead window.
 * 2. Picks the latest preferred shopping weekday before the earliest critical stockout
 *    (avoiding redundant trips while preventing mid-week runouts).
 * 3. Computes shelf-life-capped order quantities so perishable items aren't overbought.
 */
export function buildSmartShoppingPlan(input: SchedulerInput): ShoppingTripPlan {
  const {
    products,
    forecasts,
    profile,
    manualItems = [],
    checkedMap = {},
    now = new Date(),
  } = input;

  const lookahead = Math.max(3, profile.shopLookaheadDays || 6);
  const cycleDays = Math.max(4, profile.minTripIntervalDays || 5);
  const preferredDays =
    profile.preferredShopDays.length > 0 ? profile.preferredShopDays : [3, 6]; // Wed, Sat

  // Identify items needing restock within lookahead window
  interface Candidate {
    product: Product;
    forecast: ConsumptionForecast;
    priority: ShoppingPriority;
    reason: string;
  }

  const candidates: Candidate[] = [];

  for (const product of products) {
    const f = forecasts[product.id];
    if (!f) continue;

    if (f.currentStock <= 0.01 && product.isStaple) {
      candidates.push({
        product,
        forecast: f,
        priority: 'critical',
        reason: 'Out of stock (household staple)',
      });
    } else if (f.daysUntilReorder <= 1.5 || f.daysRemaining <= 2.2) {
      candidates.push({
        product,
        forecast: f,
        priority: 'critical',
        reason: `Depletes in ${f.daysRemaining.toFixed(1)}d (${f.confidenceScore}% conf.)`,
      });
    } else if (f.daysUntilReorder <= lookahead) {
      candidates.push({
        product,
        forecast: f,
        priority: 'upcoming',
        reason: `Reorder by ${f.reorderDate.slice(5)} (~${f.daysRemaining.toFixed(1)}d left)`,
      });
    }
  }

  // Determine optimal trip offset (days from today)
  let earliestCriticalDepletion = lookahead;
  let hasUrgentOut = false;

  for (const c of candidates) {
    if (c.forecast.currentStock <= 0.01) {
      hasUrgentOut = true;
      earliestCriticalDepletion = Math.min(earliestCriticalDepletion, 1);
    } else if (c.priority === 'critical') {
      earliestCriticalDepletion = Math.min(
        earliestCriticalDepletion,
        Math.max(0, Math.floor(c.forecast.daysRemaining - 0.5))
      );
    } else {
      earliestCriticalDepletion = Math.min(
        earliestCriticalDepletion,
        Math.max(1, Math.floor(c.forecast.daysUntilReorder + 1))
      );
    }
  }

  const maxAllowedOffset = Math.max(0, Math.min(lookahead, Math.floor(earliestCriticalDepletion)));

  // Pick the latest preferred shopping weekday within [0, maxAllowedOffset]
  // so the user batches the maximum number of items without stocking out
  let chosenOffset = maxAllowedOffset;
  let matchedPreferred = false;

  if (candidates.length === 0) {
    // No urgent items: pick the next preferred shopping day at least 2 days out
    for (let d = 2; d <= 9; d++) {
      const dow = addDays(now, d).getDay();
      if (preferredDays.includes(dow)) {
        chosenOffset = d;
        matchedPreferred = true;
        break;
      }
    }
  } else {
    for (let d = maxAllowedOffset; d >= 0; d--) {
      const dow = addDays(now, d).getDay();
      if (preferredDays.includes(dow)) {
        chosenOffset = d;
        matchedPreferred = true;
        break;
      }
    }
    if (!matchedPreferred && !hasUrgentOut && maxAllowedOffset === 0) {
      chosenOffset = 0;
    }
  }

  const scheduledDateObj = addDays(now, chosenOffset);
  const scheduledDate = toDateKey(scheduledDateObj);
  const scheduledDayName = DAY_NAMES[scheduledDateObj.getDay()];

  // Build shelf-life-capped recommended quantities for each candidate
  const tripId = `trip_${scheduledDate}`;
  const predictedItems: ShoppingListItem[] = candidates.map(({ product, forecast, priority, reason }) => {
    // Stock expected to remain on the scheduled shopping day
    const projectedStockAtTrip = Math.max(
      0,
      forecast.currentStock - forecast.dailyRateMean * chosenOffset
    );

    // Cap target horizon at 85% of product shelf life to avoid spoilage waste
    const safeHorizonDays = Math.min(
      cycleDays + forecast.safetyStockDays,
      Math.max(2, product.defaultShelfLifeDays * 0.85)
    );

    const rawNeeded = Math.max(
      product.defaultPackageQty * 0.5,
      forecast.dailyRateMean * safeHorizonDays - projectedStockAtTrip
    );

    const packagesToBuy = Math.max(
      1,
      Math.min(4, Math.ceil(rawNeeded / Math.max(1, product.defaultPackageQty)))
    );
    const recommendedQty = Math.round(packagesToBuy * product.defaultPackageQty * 10) / 10;
    const itemId = `shop_${product.id}`;

    return {
      id: itemId,
      tripId,
      productId: product.id,
      name: product.name,
      category: product.category,
      aisle: product.aisle,
      recommendedQty,
      packagesToBuy,
      unit: product.defaultUnit,
      priority,
      reason,
      estimatedPrice: Math.round(packagesToBuy * product.avgUnitPrice * 100) / 100,
      isChecked: Boolean(checkedMap[itemId]),
      source: 'predicted',
    };
  });

  // Merge user-added manual items without duplicating predicted products
  const predictedProductIds = new Set(predictedItems.map((i) => i.productId).filter(Boolean));
  const mergedManual = manualItems
    .filter((m) => !m.productId || !predictedProductIds.has(m.productId))
    .map((m) => ({
      ...m,
      tripId,
      isChecked: checkedMap[m.id] ?? m.isChecked,
    }));

  const priorityRank: Record<ShoppingPriority, number> = {
    critical: 0,
    upcoming: 1,
    optional: 2,
  };

  const allItems = [...predictedItems, ...mergedManual].sort((a, b) => {
    const pDiff = priorityRank[a.priority] - priorityRank[b.priority];
    if (pDiff !== 0) return pDiff;
    return a.aisle.localeCompare(b.aisle);
  });

  const criticalCount = allItems.filter((i) => i.priority === 'critical').length;
  const upcomingCount = allItems.filter((i) => i.priority === 'upcoming').length;
  const estimatedTotal =
    Math.round(allItems.reduce((sum, i) => sum + i.estimatedPrice, 0) * 100) / 100;

  let reason: string;
  if (criticalCount > 0) {
    reason = matchedPreferred
      ? `Matches your ${scheduledDayName} shop preference before ${criticalCount} critical item${criticalCount > 1 ? 's' : ''} run out`
      : `Prevent stockout on ${criticalCount} critical item${criticalCount > 1 ? 's' : ''} (${allItems.length} consolidated)`;
  } else if (upcomingCount > 0) {
    reason = `Consolidated ${upcomingCount} upcoming restock${upcomingCount > 1 ? 's' : ''} into your ${scheduledDayName} trip`;
  } else {
    reason = `Pantry healthy — next routine check-in on ${scheduledDayName}`;
  }

  // Schedule reminder morning of trip (or 2 hours from now if trip is today)
  const reminderDateObj = new Date(scheduledDateObj.getTime());
  reminderDateObj.setHours(profile.reminderHour || 9, 0, 0, 0);
  if (reminderDateObj.getTime() <= now.getTime()) {
    reminderDateObj.setTime(now.getTime() + 2 * 3600 * 1000);
  }

  return {
    id: tripId,
    scheduledDate,
    daysUntilTrip: chosenOffset,
    reason,
    criticalCount,
    upcomingCount,
    estimatedTotal,
    items: allItems,
    reminderDate: reminderDateObj.toISOString(),
    status: 'scheduled',
  };
}
