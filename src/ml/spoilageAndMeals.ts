import {
  ConsumptionForecast,
  Product,
  RecipeTemplate,
  ZeroWasteMealRecommendation,
} from '../domain/types';
import { calculateProductNutrition, sumNutrition } from './nutritionCalculator';

/**
 * Recommends high-fit meals that rescue ingredients at risk of spoiling while
 * maximizing pantry coverage and staying aligned with the user's remaining daily calorie budget.
 */
export function recommendZeroWasteMeals(params: {
  recipes: RecipeTemplate[];
  products: Product[];
  forecasts: Record<string, ConsumptionForecast>;
  remainingKcalBudget: number;
  limit?: number;
}): ZeroWasteMealRecommendation[] {
  const { recipes, products, forecasts, remainingKcalBudget, limit = 3 } = params;
  const productMap = new Map(products.map((p) => [p.id, p]));

  const recommendations: ZeroWasteMealRecommendation[] = [];

  for (const recipe of recipes) {
    let availableCount = 0;
    let rescueWeightedSum = 0;
    const rescuedItems: ZeroWasteMealRecommendation['rescuedItems'] = [];
    const nutritionParts = [];

    for (const ing of recipe.ingredients) {
      const product = productMap.get(ing.productId);
      if (!product) continue;

      nutritionParts.push(calculateProductNutrition(product, ing.quantity));
      const forecast = forecasts[ing.productId];
      if (!forecast) continue;

      if (forecast.currentStock >= ing.quantity * 0.5) {
        availableCount += 1;
      }

      const expDays = forecast.daysUntilEarliestExpiry;
      const isExpiringSoon = expDays !== null && expDays <= 4 && forecast.currentStock > 0;
      if (isExpiringSoon || forecast.spoilageRiskScore >= 0.35) {
        const urgencyWeight =
          forecast.spoilageRiskScore * 0.65 +
          (expDays !== null ? Math.max(0, (5 - Math.max(0, expDays)) / 5) * 0.35 : 0);
        rescueWeightedSum += urgencyWeight;
        rescuedItems.push({
          productId: product.id,
          productName: product.name,
          daysUntilExpiry: expDays ?? 3,
          spoilageRiskScore: forecast.spoilageRiskScore,
        });
      }
    }

    const totalIngredients = Math.max(1, recipe.ingredients.length);
    const pantryCoverageRatio = Math.round((availableCount / totalIngredients) * 100) / 100;
    const nutrition = sumNutrition(nutritionParts);

    // Rescue score normalized to 0..1
    const rescueScore = Math.min(1, rescueWeightedSum / 1.4);

    // Calorie fit score: best when meal kcal is within remaining budget + 150 kcal grace
    const fitsRemainingCalories =
      remainingKcalBudget <= 0 ? nutrition.kcal <= 400 : nutrition.kcal <= remainingKcalBudget + 120;
    let calorieFit = 0.7;
    if (remainingKcalBudget > 0) {
      const targetMealKcal = Math.min(remainingKcalBudget, Math.max(300, remainingKcalBudget * 0.65));
      const diffRatio = Math.abs(nutrition.kcal - targetMealKcal) / Math.max(250, targetMealKcal);
      calorieFit = Math.max(0.15, 1 - diffRatio * 0.7);
    }

    const compositeScore = Math.round(
      (0.50 * rescueScore + 0.30 * pantryCoverageRatio + 0.20 * calorieFit) * 100
    );

    if (pantryCoverageRatio >= 0.5) {
      recommendations.push({
        recipe,
        score: compositeScore,
        rescuedItems: rescuedItems.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry),
        pantryCoverageRatio,
        nutrition,
        fitsRemainingCalories,
      });
    }
  }

  return recommendations
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
