import { CATEGORY_PRIORS } from '../domain/catalog';
import {
  ConsumptionEvent,
  ConsumptionForecast,
  InventoryBatch,
  Product,
} from '../domain/types';

export interface ForecasterConfig {
  /** Reference date representing "today" */
  now?: Date;
  /** Number of people in household (sub-linear prior scaling H^0.85) */
  householdSize?: number;
  /** Rolling lookback window in days */
  lookbackDays?: number;
  /** EWMA decay factor per day (0.90 => ~6.6 day half-life) */
  ewmaLambda?: number;
  /** Bayesian prior pseudo-observation weight (days) */
  priorWeightDays?: number;
  /** Lead time in days for safety stock buffer */
  leadTimeDays?: number;
  /** Z-score for 90% service level */
  serviceLevelZ?: number;
}

const MS_PER_DAY = 86_400_000;

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(base: Date, days: number): Date {
  const copy = new Date(base.getTime());
  copy.setHours(12, 0, 0, 0);
  copy.setDate(copy.getDate() + Math.round(days));
  return copy;
}

export function daysBetweenDates(from: Date, toIso: string): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12, 0, 0);
  const parsed = new Date(toIso);
  const end = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

/**
 * Returns the category-based cold-start prior consumption rate scaled sub-linearly
 * by household size (H^0.85) so brand-new items have sensible day-1 forecasts.
 */
export function getPriorDailyRate(product: Product, householdSize: number): number {
  const prior = CATEGORY_PRIORS[product.category];
  const scale = Math.pow(Math.max(1, householdSize), 0.85);
  let base: number;
  if (product.defaultUnit === 'ml') {
    base = prior.dailyRateMl;
  } else if (product.defaultUnit === 'count') {
    base = prior.dailyRateCount;
  } else {
    base = prior.dailyRateG;
  }
  // Anchor gentle sanity bounds relative to product serving size
  const servingAnchored = Math.max(product.servingSize * 0.35, Math.min(base, product.servingSize * 2.5));
  return round3(servingAnchored * scale);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Huber-style outlier dampening: prevents one-off hosting spikes from
 * skewing steady-state household consumption rate.
 */
function dampenOutliers(dailyValues: number[], priorRate: number): number[] {
  if (dailyValues.length < 4) return dailyValues;
  const nonZero = dailyValues.filter((v) => v > 0);
  if (nonZero.length < 3) return dailyValues;
  const med = median(nonZero);
  const absDevs = nonZero.map((v) => Math.abs(v - med));
  const mad = median(absDevs) * 1.4826;
  const threshold = Math.max(2.5 * mad, 1.8 * priorRate, med * 1.5);

  return dailyValues.map((v) => {
    const diff = v - med;
    if (Math.abs(diff) <= threshold) return v;
    const sign = diff >= 0 ? 1 : -1;
    return Math.max(0, med + sign * (threshold + (Math.abs(diff) - threshold) / 3));
  });
}

/**
 * Simulates forward day-by-day consumption with day-of-week seasonality multipliers
 * to find fractional days until a given stock quantity hits zero.
 */
export function simulateDepletionDays(
  stockQty: number,
  dailyRate: number,
  dowMultipliers: number[],
  startDate: Date,
  maxDays = 180
): number {
  if (stockQty <= 0) return 0;
  if (dailyRate <= 0.0001) return maxDays;

  let remaining = stockQty;
  const startDow = startDate.getDay();

  for (let dayOffset = 0; dayOffset < maxDays; dayOffset++) {
    const dow = (startDow + dayOffset) % 7;
    const mult = dowMultipliers[dow] ?? 1;
    const expectedUse = dailyRate * mult;
    if (expectedUse <= 0.0001) continue;
    if (remaining <= expectedUse) {
      return round2(dayOffset + remaining / expectedUse);
    }
    remaining -= expectedUse;
  }

  return maxDays;
}

/**
 * Core Predictive ML Model:
 * Combines Empirical Bayes cold-start shrinkage, Huber outlier dampening,
 * Exponentially Weighted Moving Average (EWMA), 7-day seasonality multipliers,
 * P10/P50/P90 uncertainty bands, and dual-clock spoilage risk analysis.
 */
export function forecastProductDepletion(
  product: Product,
  batches: InventoryBatch[],
  events: ConsumptionEvent[],
  config: ForecasterConfig = {}
): ConsumptionForecast {
  const now = config.now ?? new Date();
  const householdSize = config.householdSize ?? 2;
  const lookbackDays = config.lookbackDays ?? 56;
  const ewmaLambda = config.ewmaLambda ?? 0.90;
  const priorWeightDays = config.priorWeightDays ?? 4.0;
  const leadTimeDays = config.leadTimeDays ?? 1.5;
  const serviceLevelZ = config.serviceLevelZ ?? 1.28;

  const activeBatches = batches
    .filter((b) => b.productId === product.id && b.status === 'active' && b.remainingQty > 0)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));

  const currentStock = round2(activeBatches.reduce((sum, b) => sum + b.remainingQty, 0));

  // Filter product consumption events within rolling lookback window (excluding pure spoilage)
  const cutoffMs = now.getTime() - lookbackDays * MS_PER_DAY;
  const relevantEvents = events
    .filter(
      (e) =>
        e.productId === product.id &&
        e.source !== 'spoiled' &&
        e.quantityDelta > 0 &&
        new Date(e.occurredAt).getTime() >= cutoffMs &&
        new Date(e.occurredAt).getTime() <= now.getTime() + MS_PER_DAY
    )
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  const priorRate = getPriorDailyRate(product, householdSize);

  // Build daily consumption map over active span (from first observed event to today)
  const dailyMap = new Map<string, number>();
  let earliestEventDate: Date | null = null;

  for (const evt of relevantEvents) {
    const d = new Date(evt.occurredAt);
    if (!earliestEventDate || d < earliestEventDate) earliestEventDate = d;
    const key = toDateKey(d);
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + evt.quantityDelta);
  }

  // Construct active observation timeline (span capped at lookbackDays)
  const activeSpanDays = earliestEventDate
    ? Math.min(
        lookbackDays,
        Math.max(1, Math.floor((now.getTime() - earliestEventDate.getTime()) / MS_PER_DAY) + 1)
      )
    : 0;

  const rawDailySeries: Array<{ date: Date; dow: number; value: number }> = [];
  if (activeSpanDays > 0) {
    for (let offset = activeSpanDays - 1; offset >= 0; offset--) {
      const dayDate = addDays(now, -offset);
      const key = toDateKey(dayDate);
      rawDailySeries.push({
        date: dayDate,
        dow: dayDate.getDay(),
        value: dailyMap.get(key) ?? 0,
      });
    }
  }

  const dampenedValues = dampenOutliers(
    rawDailySeries.map((d) => d.value),
    priorRate
  );

  // Compute EWMA rate and weighted variance
  let weightedSum = 0;
  let weightTotal = 0;
  const n = dampenedValues.length;

  for (let i = 0; i < n; i++) {
    const ageDays = n - 1 - i;
    const weight = Math.pow(ewmaLambda, ageDays);
    weightedSum += weight * dampenedValues[i];
    weightTotal += weight;
  }

  const ewmaRate = weightTotal > 0 ? weightedSum / weightTotal : priorRate;

  // Empirical Bayes shrinkage between category prior and learned EWMA velocity
  const dailyRateMean = round3(
    Math.max(
      0.01,
      (priorWeightDays * priorRate + weightTotal * ewmaRate) / (priorWeightDays + weightTotal)
    )
  );

  // Weighted standard deviation with Bayesian prior floor
  let weightedSqDev = 0;
  for (let i = 0; i < n; i++) {
    const ageDays = n - 1 - i;
    const weight = Math.pow(ewmaLambda, ageDays);
    const diff = dampenedValues[i] - dailyRateMean;
    weightedSqDev += weight * diff * diff;
  }
  const priorStd = priorRate * 0.42;
  const empiricalVar = weightTotal > 1 ? weightedSqDev / weightTotal : priorStd * priorStd;
  const shrunkVar =
    (priorWeightDays * priorStd * priorStd + weightTotal * empiricalVar) /
    (priorWeightDays + weightTotal);
  const dailyRateStd = round3(Math.sqrt(Math.max(0.0001, shrunkVar)));

  // Day-of-Week Seasonality Multipliers (regularized toward 1.0)
  const dowTotals = new Array<number>(7).fill(0);
  const dowCounts = new Array<number>(7).fill(0);
  for (let i = 0; i < rawDailySeries.length; i++) {
    const dow = rawDailySeries[i].dow;
    dowTotals[dow] += dampenedValues[i];
    dowCounts[dow] += 1;
  }

  const kReg = 3.0;
  const rawMultipliers = dowTotals.map((total, dow) => {
    const count = dowCounts[dow];
    if (count === 0 || dailyRateMean <= 0) return 1.0;
    const dowMean = total / count;
    const ratio = Math.min(2.2, Math.max(0.35, dowMean / dailyRateMean));
    return (kReg * 1.0 + count * ratio) / (kReg + count);
  });

  const meanMult = rawMultipliers.reduce((a, b) => a + b, 0) / 7;
  const dowMultipliers = rawMultipliers.map((m) => round2(m / (meanMult || 1)));

  // Effective sample size for confidence interval width
  const effSampleSize = Math.max(1, weightTotal);
  const rateUncertainty = (serviceLevelZ * dailyRateStd) / Math.sqrt(Math.max(1, effSampleSize / 2.5));
  const fastRate = dailyRateMean + rateUncertainty;
  const slowRate = Math.max(dailyRateMean * 0.25, dailyRateMean - rateUncertainty);

  const daysRemaining = simulateDepletionDays(currentStock, dailyRateMean, dowMultipliers, now);
  const p10DaysRemaining = simulateDepletionDays(currentStock, fastRate, dowMultipliers, now);
  const p90DaysRemaining = simulateDepletionDays(currentStock, slowRate, dowMultipliers, now);

  // Model confidence score (0 - 100)
  const activeEventDays = dailyMap.size;
  const depthFactor = 1 - Math.exp(-activeEventDays / 10);
  const cv = dailyRateMean > 0 ? dailyRateStd / dailyRateMean : 1;
  const stabilityFactor = 1 / (1 + 0.55 * cv);
  const confidenceScore = Math.round(
    Math.min(98, Math.max(18, 20 + 80 * (0.65 * depthFactor + 0.35 * stabilityFactor)))
  );

  // Safety stock days & Reorder date
  const rawSafetyDays = (serviceLevelZ * dailyRateStd * Math.sqrt(leadTimeDays)) / dailyRateMean;
  const safetyStockDays = round1(Math.min(4.0, Math.max(1.0, rawSafetyDays)));
  const daysUntilReorder = round1(Math.max(0, daysRemaining - safetyStockDays));

  // Dual-clock FIFO Spoilage Risk Analysis
  let cumulativeStockBefore = 0;
  let projectedWasteQty = 0;
  let maxSpoilageRisk = 0;
  let earliestExpiryDate: string | null = null;
  let daysUntilEarliestExpiry: number | null = null;

  for (const batch of activeBatches) {
    const expDays = daysBetweenDates(now, batch.expiresAt);
    if (daysUntilEarliestExpiry === null || expDays < daysUntilEarliestExpiry) {
      daysUntilEarliestExpiry = expDays;
      earliestExpiryDate = batch.expiresAt.slice(0, 10);
    }

    const stockThroughBatch = cumulativeStockBefore + batch.remainingQty;
    const daysToConsumeThroughBatch = simulateDepletionDays(
      stockThroughBatch,
      dailyRateMean,
      dowMultipliers,
      now
    );

    if (expDays <= 0) {
      // Already expired or expires today while stock remains
      projectedWasteQty += batch.remainingQty;
      maxSpoilageRisk = Math.max(maxSpoilageRisk, 0.98);
    } else if (expDays < daysToConsumeThroughBatch) {
      // Compute how much can be eaten before expiry
      let consumableBeforeExpiry = 0;
      const startDow = now.getDay();
      for (let d = 0; d < expDays; d++) {
        consumableBeforeExpiry += dailyRateMean * (dowMultipliers[(startDow + d) % 7] ?? 1);
      }
      const consumableFromThisBatch = Math.max(0, consumableBeforeExpiry - cumulativeStockBefore);
      const batchWaste = Math.max(0, batch.remainingQty - consumableFromThisBatch);
      projectedWasteQty += batchWaste;

      const wasteRatio = batch.remainingQty > 0 ? batchWaste / batch.remainingQty : 0;
      // Risk intensifies as expiration gets closer
      const proximityBoost = Math.exp(-Math.max(0, expDays - 1) / 6);
      const batchRisk = Math.min(1, Math.max(0, wasteRatio * (0.45 + 0.55 * proximityBoost)));
      maxSpoilageRisk = Math.max(maxSpoilageRisk, batchRisk);
    }

    cumulativeStockBefore = stockThroughBatch;
  }

  projectedWasteQty = round1(projectedWasteQty);
  const spoilageRiskScore = round2(maxSpoilageRisk);

  // Urgency classification
  let urgencyStatus: ConsumptionForecast['urgencyStatus'] = 'healthy';
  if (currentStock <= 0.01) {
    urgencyStatus = 'out';
  } else if (daysRemaining <= safetyStockDays || daysRemaining <= 2.2) {
    urgencyStatus = 'critical';
  } else if (spoilageRiskScore >= 0.45 && (daysUntilEarliestExpiry ?? 99) <= 4) {
    urgencyStatus = 'expiring';
  } else if (daysRemaining <= safetyStockDays + 3.5) {
    urgencyStatus = 'low';
  }

  return {
    productId: product.id,
    currentStock,
    unit: product.defaultUnit,
    dailyRateMean,
    dailyRateStd,
    dowMultipliers,
    observationDays: activeEventDays,
    daysRemaining,
    p10DaysRemaining,
    p90DaysRemaining,
    predictedDepletionDate: toDateKey(addDays(now, daysRemaining)),
    p10DepletionDate: toDateKey(addDays(now, p10DaysRemaining)),
    p90DepletionDate: toDateKey(addDays(now, p90DaysRemaining)),
    confidenceScore,
    safetyStockDays,
    reorderDate: toDateKey(addDays(now, daysUntilReorder)),
    daysUntilReorder,
    earliestExpiryDate,
    daysUntilEarliestExpiry,
    spoilageRiskScore,
    projectedWasteQty,
    urgencyStatus,
    computedAt: now.toISOString(),
  };
}

export function forecastAllProducts(
  products: Product[],
  batches: InventoryBatch[],
  events: ConsumptionEvent[],
  config: ForecasterConfig = {}
): Record<string, ConsumptionForecast> {
  const result: Record<string, ConsumptionForecast> = {};
  for (const product of products) {
    result[product.id] = forecastProductDepletion(product, batches, events, config);
  }
  return result;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
