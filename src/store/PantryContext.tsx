import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CATEGORY_PRIORS, DEFAULT_PRODUCTS, RECIPE_TEMPLATES } from '../domain/catalog';
import {
  BaseUnit,
  ConsumptionEvent,
  ConsumptionForecast,
  FoodCategory,
  InventoryBatch,
  MealItem,
  MealLog,
  MealType,
  NutritionTotals,
  ParsedReceipt,
  Product,
  ReceiptRecord,
  RecipeTemplate,
  ShoppingListItem,
  ShoppingTripPlan,
  StorageLocation,
  UserProfile,
  ZeroWasteMealRecommendation,
} from '../domain/types';
import { pantryRepository, PersistedState } from '../db/repository';
import { addDays, forecastAllProducts, toDateKey } from '../ml/depletionForecaster';
import {
  calculateProductNutrition,
  deductInventoryFifo,
  sumNutrition,
} from '../ml/nutritionCalculator';
import { buildSmartShoppingPlan } from '../ml/shoppingScheduler';
import { recommendZeroWasteMeals } from '../ml/spoilageAndMeals';
import { syncSmartNotifications } from '../services/notificationService';

export interface NewMealInput {
  mealType: MealType;
  title: string;
  ingredients: Array<{
    productId?: string | null;
    name: string;
    quantity: number;
    unit: BaseUnit;
    /** Optional explicit nutrition if not linked to a catalog product */
    customNutrition?: NutritionTotals;
  }>;
  deductFromPantry?: boolean;
}

export interface AddPantryBatchInput {
  product: Product;
  quantity: number;
  expiresAt?: string;
  unitCost?: number;
  storageLocation?: StorageLocation;
  receiptId?: string | null;
}

export interface PantryContextValue {
  loading: boolean;
  profile: UserProfile | null;
  products: Product[];
  batches: InventoryBatch[];
  events: ConsumptionEvent[];
  meals: MealLog[];
  receipts: ReceiptRecord[];
  forecasts: Record<string, ConsumptionForecast>;
  shoppingPlan: ShoppingTripPlan | null;
  todayMeals: MealLog[];
  todayNutrition: NutritionTotals;
  weeklyCalories: Array<{ dateKey: string; label: string; kcal: number }>;
  zeroWasteMeals: ZeroWasteMealRecommendation[];
  lastReminderSyncCount: number;
  // Mutations
  addInventoryBatch: (input: AddPantryBatchInput) => Promise<void>;
  importParsedReceipt: (parsed: ParsedReceipt, rawOcrText: string) => Promise<number>;
  quickConsumeProduct: (productId: string, quantity?: number) => Promise<void>;
  markProductOutOfStock: (productId: string) => Promise<void>;
  adjustProductStock: (productId: string, newTotalQty: number) => Promise<void>;
  logMeal: (input: NewMealInput) => Promise<MealLog>;
  logRecipeTemplate: (recipe: RecipeTemplate) => Promise<MealLog>;
  deleteMeal: (mealId: string) => Promise<void>;
  toggleShoppingItem: (itemId: string) => Promise<void>;
  addManualShoppingItem: (name: string, category?: FoodCategory, price?: number) => Promise<void>;
  completeShoppingTrip: () => Promise<number>;
  updateProfile: (patch: Partial<UserProfile>) => Promise<void>;
  clearAllData: () => Promise<void>;
  resetDemoData: () => Promise<void>;
}

const PantryContext = createContext<PantryContextValue | null>(null);

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function PantryProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastReminderSyncCount, setLastReminderSyncCount] = useState(0);

  useEffect(() => {
    let active = true;
    pantryRepository
      .loadOrSeed()
      .then((loaded) => {
        if (active) {
          setState(loaded);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback(async (next: PersistedState) => {
    setState(next);
    await pantryRepository.saveAll(next);
  }, []);

  const forecasts = useMemo<Record<string, ConsumptionForecast>>(() => {
    if (!state) return {};
    return forecastAllProducts(state.products, state.batches, state.events, {
      householdSize: state.profile.householdSize,
      now: new Date(),
    });
  }, [state]);

  const shoppingPlan = useMemo<ShoppingTripPlan | null>(() => {
    if (!state) return null;
    return buildSmartShoppingPlan({
      products: state.products,
      forecasts,
      profile: state.profile,
      manualItems: state.manualShoppingItems,
      checkedMap: state.checkedShoppingMap,
      now: new Date(),
    });
  }, [state, forecasts]);

  // Sync local notifications whenever shopping plan or reminder preferences update
  useEffect(() => {
    if (!state || !shoppingPlan) return;
    syncSmartNotifications({
      tripPlan: shoppingPlan,
      forecasts,
      products: state.products,
      profile: state.profile,
    }).then((res) => setLastReminderSyncCount(res.scheduledCount));
  }, [shoppingPlan?.id, shoppingPlan?.items.length, state?.profile.remindersEnabled, state?.profile.reminderHour]);

  const todayKey = toDateKey(new Date());

  const todayMeals = useMemo(() => {
    if (!state) return [];
    return state.meals
      .filter((m) => toDateKey(new Date(m.loggedAt)) === todayKey)
      .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  }, [state, todayKey]);

  const todayNutrition = useMemo<NutritionTotals>(() => {
    return sumNutrition(
      todayMeals.map((m) => ({
        kcal: m.totalKcal,
        proteinG: m.totalProteinG,
        carbsG: m.totalCarbsG,
        fatG: m.totalFatG,
        fiberG: m.totalFiberG,
      }))
    );
  }, [todayMeals]);

  const weeklyCalories = useMemo(() => {
    const now = new Date();
    const out: Array<{ dateKey: string; label: string; kcal: number }> = [];
    for (let offset = -6; offset <= 0; offset++) {
      const d = addDays(now, offset);
      const key = toDateKey(d);
      const total = (state?.meals ?? [])
        .filter((m) => toDateKey(new Date(m.loggedAt)) === key)
        .reduce((acc, m) => acc + m.totalKcal, 0);
      out.push({
        dateKey: key,
        label: offset === 0 ? 'Today' : SHORT_DAYS[d.getDay()],
        kcal: Math.round(total),
      });
    }
    return out;
  }, [state?.meals]);

  const zeroWasteMeals = useMemo(() => {
    if (!state) return [];
    const remaining = Math.max(0, state.profile.dailyCalorieGoal - todayNutrition.kcal);
    return recommendZeroWasteMeals({
      recipes: RECIPE_TEMPLATES,
      products: state.products,
      forecasts,
      remainingKcalBudget: remaining,
      limit: 3,
    });
  }, [state, forecasts, todayNutrition.kcal]);

  const addInventoryBatch = useCallback(
    async (input: AddPantryBatchInput) => {
      if (!state) return;
      const nowIso = new Date().toISOString();
      const exists = state.products.some((p) => p.id === input.product.id);
      const nextProducts = exists ? state.products : [input.product, ...state.products];

      const expiresAt =
        input.expiresAt ??
        addDays(new Date(), input.product.defaultShelfLifeDays).toISOString();

      const newBatch: InventoryBatch = {
        id: `batch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        productId: input.product.id,
        receiptId: input.receiptId ?? null,
        initialQty: input.quantity,
        remainingQty: input.quantity,
        unit: input.product.defaultUnit,
        purchasedAt: nowIso,
        expiresAt,
        storageLocation: input.storageLocation ?? input.product.storageLocation,
        unitCost: input.unitCost ?? input.product.avgUnitPrice,
        status: 'active',
        updatedAt: nowIso,
      };

      await persist({
        ...state,
        products: nextProducts,
        batches: [newBatch, ...state.batches],
      });
    },
    [state, persist]
  );

  const importParsedReceipt = useCallback(
    async (parsed: ParsedReceipt, rawOcrText: string): Promise<number> => {
      if (!state) return 0;
      const nowIso = new Date().toISOString();
      const receiptId = `rcpt_${Date.now()}`;
      const selectedLines = parsed.lines.filter((l) => l.selected);
      if (selectedLines.length === 0) return 0;

      const nextProducts = [...state.products];
      const newBatches: InventoryBatch[] = [];

      for (const line of selectedLines) {
        let product = line.matchedProductId
          ? nextProducts.find((p) => p.id === line.matchedProductId)
          : undefined;

        if (!product && line.matchedProductId) {
          const catalogTemplate = DEFAULT_PRODUCTS.find((p) => p.id === line.matchedProductId);
          if (catalogTemplate) {
            product = {
              ...catalogTemplate,
              avgUnitPrice: line.price || catalogTemplate.avgUnitPrice,
              updatedAt: nowIso,
            };
            nextProducts.push(product);
          }
        }

        if (!product) {
          const prior = CATEGORY_PRIORS[line.category];
          const newProd: Product = {
            id: `prod_rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            barcode: null,
            name: line.normalizedName,
            brand: null,
            category: line.category,
            defaultUnit: line.unit,
            defaultPackageQty: line.quantity,
            servingSize: Math.max(1, Math.round(line.quantity / 4)),
            servingLabel: `1 serving`,
            kcalPer100: line.kcalPer100,
            proteinPer100: 6,
            carbsPer100: 14,
            fatPer100: 4,
            fiberPer100: 2,
            defaultShelfLifeDays: line.estimatedShelfLifeDays,
            storageLocation: line.storageLocation,
            avgUnitPrice: line.price,
            aisle: prior.defaultAisle,
            isStaple: false,
            updatedAt: nowIso,
          };
          nextProducts.push(newProd);
          product = newProd;
        }

        newBatches.push({
          id: `batch_rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          productId: product.id,
          receiptId,
          initialQty: line.quantity,
          remainingQty: line.quantity,
          unit: product.defaultUnit,
          purchasedAt: parsed.purchasedAt,
          expiresAt: addDays(new Date(parsed.purchasedAt), line.estimatedShelfLifeDays).toISOString(),
          storageLocation: line.storageLocation,
          unitCost: line.price,
          status: 'active',
          updatedAt: nowIso,
        });
      }

      const receiptRecord: ReceiptRecord = {
        id: receiptId,
        merchantName: parsed.merchantName,
        purchasedAt: parsed.purchasedAt,
        subtotal: parsed.subtotal,
        tax: parsed.tax,
        total: parsed.total,
        rawOcrText,
        parsedItemCount: selectedLines.length,
      };

      await persist({
        ...state,
        products: nextProducts,
        batches: [...newBatches, ...state.batches],
        receipts: [receiptRecord, ...state.receipts],
      });
      return selectedLines.length;
    },
    [state, persist]
  );

  const quickConsumeProduct = useCallback(
    async (productId: string, quantity?: number) => {
      if (!state) return;
      const product = state.products.find((p) => p.id === productId);
      if (!product) return;
      const deductQty = quantity ?? product.servingSize;
      const res = deductInventoryFifo({
        batches: state.batches,
        productId,
        quantityToDeduct: deductQty,
        unit: product.defaultUnit,
        source: 'quick_use',
        occurredAt: new Date().toISOString(),
      });
      await persist({
        ...state,
        batches: res.updatedBatches,
        events: [...res.generatedEvents, ...state.events],
      });
    },
    [state, persist]
  );

  const markProductOutOfStock = useCallback(
    async (productId: string) => {
      if (!state) return;
      const product = state.products.find((p) => p.id === productId);
      if (!product) return;
      const currentTotal = state.batches
        .filter((b) => b.productId === productId && b.status === 'active')
        .reduce((acc, b) => acc + b.remainingQty, 0);
      if (currentTotal <= 0) return;

      const res = deductInventoryFifo({
        batches: state.batches,
        productId,
        quantityToDeduct: currentTotal,
        unit: product.defaultUnit,
        source: 'marked_empty',
        occurredAt: new Date().toISOString(),
      });
      await persist({
        ...state,
        batches: res.updatedBatches,
        events: [...res.generatedEvents, ...state.events],
      });
    },
    [state, persist]
  );

  const adjustProductStock = useCallback(
    async (productId: string, newTotalQty: number) => {
      if (!state) return;
      const product = state.products.find((p) => p.id === productId);
      if (!product) return;
      const safeTarget = Math.max(0, newTotalQty);
      const currentTotal = state.batches
        .filter((b) => b.productId === productId && b.status === 'active')
        .reduce((acc, b) => acc + b.remainingQty, 0);

      const nowIso = new Date().toISOString();
      if (safeTarget < currentTotal) {
        const delta = Math.round((currentTotal - safeTarget) * 100) / 100;
        const res = deductInventoryFifo({
          batches: state.batches,
          productId,
          quantityToDeduct: delta,
          unit: product.defaultUnit,
          source: 'stock_adjustment',
          occurredAt: nowIso,
        });
        await persist({
          ...state,
          batches: res.updatedBatches,
          events: [...res.generatedEvents, ...state.events],
        });
      } else if (safeTarget > currentTotal) {
        const extra = Math.round((safeTarget - currentTotal) * 100) / 100;
        const newBatch: InventoryBatch = {
          id: `batch_adj_${Date.now()}`,
          productId,
          initialQty: extra,
          remainingQty: extra,
          unit: product.defaultUnit,
          purchasedAt: nowIso,
          expiresAt: addDays(new Date(), product.defaultShelfLifeDays).toISOString(),
          storageLocation: product.storageLocation,
          unitCost: 0,
          status: 'active',
          updatedAt: nowIso,
        };
        await persist({
          ...state,
          batches: [newBatch, ...state.batches],
        });
      }
    },
    [state, persist]
  );

  const logMeal = useCallback(
    async (input: NewMealInput): Promise<MealLog> => {
      if (!state) throw new Error('Store not initialized');
      const nowIso = new Date().toISOString();
      const mealId = `meal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const pantryMap = new Map(state.products.map((p) => [p.id, p]));
      const catalogMap = new Map(DEFAULT_PRODUCTS.map((p) => [p.id, p]));

      let workingBatches = state.batches;
      const newEvents: ConsumptionEvent[] = [];
      const mealItems: MealItem[] = [];

      for (let i = 0; i < input.ingredients.length; i++) {
        const ing = input.ingredients[i];
        const pantryProd = ing.productId ? pantryMap.get(ing.productId) : undefined;
        const nutritionProd = pantryProd ?? (ing.productId ? catalogMap.get(ing.productId) : undefined);
        const nut = nutritionProd
          ? calculateProductNutrition(nutritionProd, ing.quantity)
          : ing.customNutrition ?? { kcal: 150, proteinG: 8, carbsG: 18, fatG: 5, fiberG: 2 };

        mealItems.push({
          id: `${mealId}_it_${i}`,
          mealLogId: mealId,
          productId: pantryProd?.id ?? null,
          name: nutritionProd?.name ?? ing.name,
          quantity: ing.quantity,
          unit: nutritionProd?.defaultUnit ?? ing.unit,
          kcal: nut.kcal,
          proteinG: nut.proteinG,
          carbsG: nut.carbsG,
          fatG: nut.fatG,
          fiberG: nut.fiberG,
        });

        if (pantryProd && input.deductFromPantry !== false) {
          const deduction = deductInventoryFifo({
            batches: workingBatches,
            productId: pantryProd.id,
            quantityToDeduct: ing.quantity,
            unit: pantryProd.defaultUnit,
            source: 'meal_log',
            occurredAt: nowIso,
            mealLogId: mealId,
          });
          workingBatches = deduction.updatedBatches;
          newEvents.push(...deduction.generatedEvents);
        }
      }

      const totals = sumNutrition(mealItems);
      const mealLog: MealLog = {
        id: mealId,
        userId: state.profile.id,
        mealType: input.mealType,
        title: input.title.trim() || 'Logged Meal',
        loggedAt: nowIso,
        items: mealItems,
        totalKcal: totals.kcal,
        totalProteinG: totals.proteinG,
        totalCarbsG: totals.carbsG,
        totalFatG: totals.fatG,
        totalFiberG: totals.fiberG,
        updatedAt: nowIso,
      };

      await persist({
        ...state,
        batches: workingBatches,
        events: [...newEvents, ...state.events],
        meals: [mealLog, ...state.meals],
      });

      return mealLog;
    },
    [state, persist]
  );

  const logRecipeTemplate = useCallback(
    async (recipe: RecipeTemplate): Promise<MealLog> => {
      if (!state) throw new Error('Store not initialized');
      const productMap = new Map(state.products.map((p) => [p.id, p]));
      return logMeal({
        mealType: recipe.mealType,
        title: recipe.title,
        deductFromPantry: true,
        ingredients: recipe.ingredients.map((ing) => ({
          productId: ing.productId,
          name: productMap.get(ing.productId)?.name ?? ing.productId,
          quantity: ing.quantity,
          unit: ing.unit,
        })),
      });
    },
    [state, logMeal]
  );

  const deleteMeal = useCallback(
    async (mealId: string) => {
      if (!state) return;
      await persist({
        ...state,
        meals: state.meals.filter((m) => m.id !== mealId),
        events: state.events.filter((e) => e.mealLogId !== mealId),
      });
    },
    [state, persist]
  );

  const toggleShoppingItem = useCallback(
    async (itemId: string) => {
      if (!state) return;
      const nextChecked = {
        ...state.checkedShoppingMap,
        [itemId]: !state.checkedShoppingMap[itemId],
      };
      await persist({
        ...state,
        checkedShoppingMap: nextChecked,
      });
    },
    [state, persist]
  );

  const addManualShoppingItem = useCallback(
    async (name: string, category: FoodCategory = 'pantry', price = 4.99) => {
      if (!state || !name.trim()) return;
      const prior = CATEGORY_PRIORS[category];
      const item: ShoppingListItem = {
        id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        tripId: 'manual',
        productId: null,
        name: name.trim(),
        category,
        aisle: prior.defaultAisle,
        recommendedQty: 1,
        packagesToBuy: 1,
        unit: 'count',
        priority: 'optional',
        reason: 'Added manually',
        estimatedPrice: price,
        isChecked: false,
        source: 'manual',
      };
      await persist({
        ...state,
        manualShoppingItems: [item, ...state.manualShoppingItems],
      });
    },
    [state, persist]
  );

  const completeShoppingTrip = useCallback(async (): Promise<number> => {
    if (!state || !shoppingPlan) return 0;
    const checkedItems = shoppingPlan.items.filter((i) => i.isChecked);
    const itemsToRestock = checkedItems.length > 0 ? checkedItems : shoppingPlan.items;
    if (itemsToRestock.length === 0) return 0;

    const nowIso = new Date().toISOString();
    const productMap = new Map(state.products.map((p) => [p.id, p]));
    const nextProducts = [...state.products];
    const newBatches: InventoryBatch[] = [];
    const checkedManualIds = new Set<string>();

    for (const item of itemsToRestock) {
      if (item.source === 'manual') checkedManualIds.add(item.id);
      let prod = item.productId ? productMap.get(item.productId) : undefined;
      if (!prod) {
        const prior = CATEGORY_PRIORS[item.category];
        prod = {
          id: `prod_shop_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          barcode: null,
          name: item.name,
          brand: null,
          category: item.category,
          defaultUnit: item.unit,
          defaultPackageQty: item.recommendedQty,
          servingSize: 1,
          servingLabel: '1 serving',
          kcalPer100: prior.defaultKcalPer100,
          proteinPer100: 5,
          carbsPer100: 15,
          fatPer100: 4,
          fiberPer100: 2,
          defaultShelfLifeDays: prior.defaultShelfLifeDays,
          storageLocation: prior.defaultStorage,
          avgUnitPrice: item.estimatedPrice,
          aisle: item.aisle,
          isStaple: false,
          updatedAt: nowIso,
        };
        nextProducts.push(prod);
      }

      newBatches.push({
        id: `batch_trip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        productId: prod.id,
        initialQty: item.recommendedQty,
        remainingQty: item.recommendedQty,
        unit: prod.defaultUnit,
        purchasedAt: nowIso,
        expiresAt: addDays(new Date(), prod.defaultShelfLifeDays).toISOString(),
        storageLocation: prod.storageLocation,
        unitCost: item.estimatedPrice,
        status: 'active',
        updatedAt: nowIso,
      });
    }

    await persist({
      ...state,
      products: nextProducts,
      batches: [...newBatches, ...state.batches],
      manualShoppingItems: state.manualShoppingItems.filter((m) => !checkedManualIds.has(m.id)),
      checkedShoppingMap: {},
    });

    return itemsToRestock.length;
  }, [state, shoppingPlan, persist]);

  const updateProfile = useCallback(
    async (patch: Partial<UserProfile>) => {
      if (!state) return;
      await persist({
        ...state,
        profile: {
          ...state.profile,
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      });
    },
    [state, persist]
  );

  const clearAllData = useCallback(async () => {
    const blank = await pantryRepository.clearAllData();
    setState(blank);
  }, []);

  const resetDemoData = useCallback(async () => {
    const fresh = await pantryRepository.resetToDemo();
    setState(fresh);
  }, []);

  const value: PantryContextValue = {
    loading,
    profile: state?.profile ?? null,
    products: state?.products ?? [],
    batches: state?.batches ?? [],
    events: state?.events ?? [],
    meals: state?.meals ?? [],
    receipts: state?.receipts ?? [],
    forecasts,
    shoppingPlan,
    todayMeals,
    todayNutrition,
    weeklyCalories,
    zeroWasteMeals,
    lastReminderSyncCount,
    addInventoryBatch,
    importParsedReceipt,
    quickConsumeProduct,
    markProductOutOfStock,
    adjustProductStock,
    logMeal,
    logRecipeTemplate,
    deleteMeal,
    toggleShoppingItem,
    addManualShoppingItem,
    completeShoppingTrip,
    updateProfile,
    clearAllData,
    resetDemoData,
  };

  return <PantryContext.Provider value={value}>{children}</PantryContext.Provider>;
}

export function usePantry(): PantryContextValue {
  const ctx = useContext(PantryContext);
  if (!ctx) throw new Error('usePantry must be used within PantryProvider');
  return ctx;
}
