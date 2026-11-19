import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/src/components/Badge';
import { CalorieRing } from '@/src/components/CalorieRing';
import { DEFAULT_PRODUCTS } from '@/src/domain/catalog';
import { MealType, Product } from '@/src/domain/types';
import {
  calculateProductNutrition,
  formatQuantity,
  sumNutrition,
} from '@/src/ml/nutritionCalculator';
import { usePantry } from '@/src/store/PantryContext';
import { Radii, Spacing } from '@/src/theme/tokens';
import { useTheme } from '@/src/theme/useTheme';

interface DraftIngredient {
  product: Product;
  quantity: number;
  isCustom?: boolean;
}

const MEAL_TYPES: Array<{ key: MealType; label: string }> = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
];

export default function MealsScreen() {
  const { palette } = useTheme();
  const {
    profile,
    products,
    forecasts,
    todayMeals,
    todayNutrition,
    weeklyCalories,
    logMeal,
    deleteMeal,
  } = usePantry();

  const [composerOpen, setComposerOpen] = useState(false);
  const [mealType, setMealType] = useState<MealType>('dinner');
  const [mealTitle, setMealTitle] = useState('');
  const [deductFromPantry, setDeductFromPantry] = useState(true);
  const [ingSearch, setIngSearch] = useState('');
  const [draftIngredients, setDraftIngredients] = useState<DraftIngredient[]>([]);
  const [customName, setCustomName] = useState('');
  const [customKcal, setCustomKcal] = useState('');
  const [customProtein, setCustomProtein] = useState('');

  const draftNutrition = useMemo(() => {
    return sumNutrition(
      draftIngredients.map((d) => calculateProductNutrition(d.product, d.quantity))
    );
  }, [draftIngredients]);

  const pantryIds = useMemo(() => new Set(products.map((p) => p.id)), [products]);

  const pickerProducts = useMemo(() => {
    const q = ingSearch.trim().toLowerCase();
    const merged = [
      ...products,
      ...DEFAULT_PRODUCTS.filter((p) => !pantryIds.has(p.id)),
    ];
    return merged
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aIn = pantryIds.has(a.id) ? 1 : 0;
        const bIn = pantryIds.has(b.id) ? 1 : 0;
        if (aIn !== bIn) return bIn - aIn;
        return (forecasts[b.id]?.currentStock ?? 0) - (forecasts[a.id]?.currentStock ?? 0);
      });
  }, [products, pantryIds, forecasts, ingSearch]);

  if (!profile) return null;

  const maxWeeklyKcal = Math.max(
    profile.dailyCalorieGoal * 1.15,
    ...weeklyCalories.map((d) => d.kcal),
    1500
  );

  const addDraftIngredient = (product: Product) => {
    setDraftIngredients((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: Math.round((i.quantity + product.servingSize) * 10) / 10 }
            : i
        );
      }
      return [...prev, { product, quantity: product.servingSize }];
    });
  };

  const addCustomFood = () => {
    const trimmed = customName.trim();
    const kcal = Math.max(0, parseFloat(customKcal) || 0);
    if (!trimmed || kcal <= 0) return;
    const protein = Math.max(0, parseFloat(customProtein) || 0);
    const customProduct: Product = {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: trimmed,
      category: 'pantry',
      defaultUnit: 'count',
      defaultPackageQty: 1,
      servingSize: 1,
      servingLabel: '1 serving',
      kcalPer100: kcal,
      proteinPer100: protein,
      carbsPer100: 0,
      fatPer100: 0,
      fiberPer100: 0,
      defaultShelfLifeDays: 1,
      storageLocation: 'pantry',
      avgUnitPrice: 0,
      aisle: 'Custom',
      isStaple: false,
      updatedAt: new Date().toISOString(),
    };
    setDraftIngredients((prev) => [...prev, { product: customProduct, quantity: 1, isCustom: true }]);
    setCustomName('');
    setCustomKcal('');
    setCustomProtein('');
  };

  const stepIngredient = (productId: string, delta: number) => {
    setDraftIngredients((prev) =>
      prev
        .map((i) =>
          i.product.id === productId
            ? { ...i, quantity: Math.round(Math.max(0, i.quantity + delta) * 10) / 10 }
            : i
        )
        .filter((i) => i.quantity > 0)
    );
  };

  const handleSaveMeal = async () => {
    if (draftIngredients.length === 0) return;
    const autoTitle =
      mealTitle.trim() ||
      draftIngredients
        .slice(0, 2)
        .map((d) => d.product.name.split(' ').slice(-1)[0])
        .join(' & ') + ` ${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`;

    await logMeal({
      mealType,
      title: autoTitle,
      deductFromPantry,
      ingredients: draftIngredients.map((d) => ({
        productId: d.isCustom ? null : d.product.id,
        name: d.product.name,
        quantity: d.quantity,
        unit: d.product.defaultUnit,
        customNutrition: d.isCustom ? calculateProductNutrition(d.product, d.quantity) : undefined,
      })),
    });

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    setComposerOpen(false);
    setMealTitle('');
    setDraftIngredients([]);
    setIngSearch('');
    setCustomName('');
    setCustomKcal('');
    setCustomProtein('');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: palette.text }]}>Meals & Calories</Text>
            <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
              Auto-calculated macros linked directly to FIFO pantry stock
            </Text>
          </View>
          <Pressable
            onPress={() => setComposerOpen(true)}
            style={[styles.addBtn, { backgroundColor: palette.primary, flexShrink: 0 }]}>
            <Ionicons name="add" size={18} color={palette.primaryText} />
            <Text style={[styles.addBtnText, { color: palette.primaryText }]}>Log Meal</Text>
          </Pressable>
        </View>

        {/* Daily Calorie Ring */}
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <CalorieRing consumed={todayNutrition} profile={profile} />
        </View>

        {/* 7-Day Calorie Trend */}
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.cardTitle, { color: palette.text }]}>7-Day Intake Trend</Text>
            <Text style={[styles.goalHint, { color: palette.textMuted }]}>
              Goal: {profile.dailyCalorieGoal} kcal
            </Text>
          </View>

          <View style={styles.trendBars}>
            {weeklyCalories.map((day) => {
              const pct = Math.max(4, Math.round((day.kcal / maxWeeklyKcal) * 100));
              const isToday = day.label === 'Today';
              return (
                <View key={day.dateKey} style={styles.trendCol}>
                  <Text style={[styles.trendVal, { color: palette.textMuted }]}>
                    {day.kcal > 0 ? day.kcal : '—'}
                  </Text>
                  <View style={[styles.trendSlot, { backgroundColor: palette.surfaceMuted }]}>
                    <View
                      style={[
                        styles.trendFill,
                        {
                          height: `${pct}%`,
                          backgroundColor: isToday ? palette.primary : palette.accent,
                          opacity: isToday ? 1 : 0.65,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.trendDay,
                      {
                        color: isToday ? palette.primary : palette.textSecondary,
                        fontWeight: isToday ? '700' : '500',
                      },
                    ]}>
                    {day.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Today's Logged Meals */}
        <View style={styles.rowBetween}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Today’s Log</Text>
          <Text style={[styles.goalHint, { color: palette.textMuted }]}>
            {todayMeals.length} meal{todayMeals.length === 1 ? '' : 's'}
          </Text>
        </View>

        {todayMeals.length === 0 ? (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
              No meals logged yet today. Tap “Log Meal” to track calories and deduct pantry stock automatically.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {todayMeals.map((meal) => (
              <View
                key={meal.id}
                style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.mealTitleRow}>
                      <Badge label={meal.mealType.toUpperCase()} tone="primary" />
                      <Text style={[styles.mealTime, { color: palette.textMuted }]}>
                        {new Date(meal.loggedAt).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    <Text style={[styles.mealName, { color: palette.text }]}>{meal.title}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={[styles.mealKcal, { color: palette.text }]}>
                      {Math.round(meal.totalKcal)} kcal
                    </Text>
                    <Pressable onPress={() => deleteMeal(meal.id)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={16} color={palette.textMuted} />
                    </Pressable>
                  </View>
                </View>

                <Text style={[styles.macroLine, { color: palette.textSecondary }]}>
                  P {meal.totalProteinG}g · C {meal.totalCarbsG}g · F {meal.totalFatG}g · Fiber{' '}
                  {meal.totalFiberG}g
                </Text>

                <View style={[styles.ingList, { borderTopColor: palette.borderSubtle }]}>
                  {meal.items.map((item) => (
                    <View key={item.id} style={styles.ingRow}>
                      <Text style={[styles.ingName, { color: palette.textSecondary }]}>
                        {item.name} ({formatQuantity(item.quantity, item.unit)})
                      </Text>
                      <Text style={[styles.ingKcal, { color: palette.textMuted }]}>
                        {item.kcal} kcal
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* PANTRY-LINKED MEAL COMPOSER MODAL */}
      <Modal
        visible={composerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setComposerOpen(false)}>
        <SafeAreaView style={[styles.modalSafe, { backgroundColor: palette.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: palette.border }]}>
            <Pressable onPress={() => setComposerOpen(false)}>
              <Text style={[styles.cancelText, { color: palette.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: palette.text }]}>Log Meal</Text>
            <Pressable
              onPress={handleSaveMeal}
              disabled={draftIngredients.length === 0}
              style={{ opacity: draftIngredients.length === 0 ? 0.4 : 1 }}>
              <Text style={[styles.saveText, { color: palette.primary }]}>Save</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody}>
            {/* Live Auto-Calorie Preview */}
            <View style={[styles.previewBanner, { backgroundColor: palette.primarySoft, gap: 10 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.previewKcal, { color: palette.primary }]}>
                  {draftNutrition.kcal} kcal
                </Text>
                <Text style={[styles.previewMacros, { color: palette.textSecondary }]}>
                  Protein {draftNutrition.proteinG}g · Carbs {draftNutrition.carbsG}g · Fat{' '}
                  {draftNutrition.fatG}g
                </Text>
              </View>
              <Badge label={`${draftIngredients.length} items`} tone="primary" />
            </View>

            {/* Meal Type Chips */}
            <View style={styles.typeRow}>
              {MEAL_TYPES.map((t) => (
                <Pressable
                  key={t.key}
                  onPress={() => setMealType(t.key)}
                  style={[
                    styles.typeChip,
                    {
                      backgroundColor: mealType === t.key ? palette.primary : palette.surface,
                      borderColor: mealType === t.key ? palette.primary : palette.border,
                    },
                  ]}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: mealType === t.key ? palette.primaryText : palette.textSecondary,
                    }}>
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              value={mealTitle}
              onChangeText={setMealTitle}
              placeholder="Meal title (optional — auto-named if empty)"
              placeholderTextColor={palette.textMuted}
              style={[
                styles.input,
                { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text },
              ]}
            />

            <View style={[styles.switchRow, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.switchTitle, { color: palette.text }]}>
                  Auto-deduct from Pantry (FIFO)
                </Text>
                <Text style={[styles.switchSub, { color: palette.textMuted }]}>
                  Updates stock & feeds personal ML consumption rate
                </Text>
              </View>
              <Switch
                value={deductFromPantry}
                onValueChange={setDeductFromPantry}
                trackColor={{ true: palette.primary, false: palette.surfaceMuted }}
              />
            </View>

            {/* Selected Ingredients */}
            {draftIngredients.length > 0 && (
              <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <Text style={[styles.cardTitle, { color: palette.text }]}>Selected Ingredients</Text>
                {draftIngredients.map((d) => {
                  const nut = calculateProductNutrition(d.product, d.quantity);
                  const step = d.product.defaultUnit === 'count' ? 0.5 : Math.max(10, Math.round(d.product.servingSize / 2));
                  return (
                    <View key={d.product.id} style={styles.draftRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.draftName, { color: palette.text }]}>
                          {d.product.name}
                        </Text>
                        <Text style={[styles.draftSub, { color: palette.textSecondary }]}>
                          {formatQuantity(d.quantity, d.product.defaultUnit)} · {nut.kcal} kcal ·{' '}
                          {nut.proteinG}g P
                        </Text>
                      </View>
                      <View style={styles.stepper}>
                        <Pressable
                          onPress={() => stepIngredient(d.product.id, -step)}
                          style={[styles.stepBtn, { backgroundColor: palette.surfaceMuted }]}>
                          <Ionicons name="remove" size={16} color={palette.text} />
                        </Pressable>
                        <Pressable
                          onPress={() => stepIngredient(d.product.id, step)}
                          style={[styles.stepBtn, { backgroundColor: palette.primarySoft }]}>
                          <Ionicons name="add" size={16} color={palette.primary} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Quick Custom Food Entry */}
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={[styles.cardTitle, { color: palette.text }]}>Add Custom Food</Text>
              <TextInput
                value={customName}
                onChangeText={setCustomName}
                placeholder="Food name (e.g., Chicken Wrap)"
                placeholderTextColor={palette.textMuted}
                style={[
                  styles.input,
                  { backgroundColor: palette.background, borderColor: palette.border, color: palette.text },
                ]}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={customKcal}
                  onChangeText={setCustomKcal}
                  keyboardType="numeric"
                  placeholder="Calories (kcal)"
                  placeholderTextColor={palette.textMuted}
                  style={[
                    styles.input,
                    { backgroundColor: palette.background, borderColor: palette.border, color: palette.text, flex: 1 },
                  ]}
                />
                <TextInput
                  value={customProtein}
                  onChangeText={setCustomProtein}
                  keyboardType="numeric"
                  placeholder="Protein (g)"
                  placeholderTextColor={palette.textMuted}
                  style={[
                    styles.input,
                    { backgroundColor: palette.background, borderColor: palette.border, color: palette.text, flex: 1 },
                  ]}
                />
                <Pressable
                  onPress={addCustomFood}
                  style={[
                    styles.addBtn,
                    { backgroundColor: palette.primary, borderRadius: Radii.sm + 2, paddingHorizontal: 14 },
                  ]}>
                  <Text style={[styles.addBtnText, { color: palette.primaryText }]}>Add</Text>
                </Pressable>
              </View>
            </View>

            {/* Pantry & Common Food Picker */}
            <Text style={[styles.sectionTitle, { color: palette.text }]}>
              {products.length > 0 ? 'Tap Pantry or Common Foods' : 'Tap Common Foods to Add'}
            </Text>
            <TextInput
              value={ingSearch}
              onChangeText={setIngSearch}
              placeholder="Search foods..."
              placeholderTextColor={palette.textMuted}
              style={[
                styles.input,
                { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text },
              ]}
            />

            <View style={{ gap: 8 }}>
              {pickerProducts.map((prod) => {
                const inPantry = pantryIds.has(prod.id);
                const stock = forecasts[prod.id]?.currentStock ?? 0;
                const servingNut = calculateProductNutrition(prod, prod.servingSize);
                return (
                  <Pressable
                    key={prod.id}
                    onPress={() => addDraftIngredient(prod)}
                    style={[
                      styles.pickerRow,
                      { backgroundColor: palette.surface, borderColor: palette.border },
                    ]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.draftName, { color: palette.text }]}>{prod.name}</Text>
                      <Text style={[styles.draftSub, { color: palette.textSecondary }]}>
                        +{prod.servingLabel} ({servingNut.kcal} kcal) ·{' '}
                        {inPantry
                          ? `In pantry: ${formatQuantity(stock, prod.defaultUnit)}`
                          : 'Common food'}
                      </Text>
                    </View>
                    <Ionicons name="add-circle" size={24} color={palette.primary} />
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: 40,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 25,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: Radii.full,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalHint: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  trendBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 4,
  },
  trendCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  trendVal: {
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  trendSlot: {
    width: '100%',
    maxWidth: 26,
    height: 76,
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  trendFill: {
    width: '100%',
    borderRadius: 6,
  },
  trendDay: {
    fontSize: 11,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 19,
  },
  mealTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mealTime: {
    fontSize: 12,
  },
  mealName: {
    fontSize: 15,
    fontWeight: '700',
  },
  mealKcal: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  macroLine: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  ingList: {
    borderTopWidth: 1,
    paddingTop: 8,
    gap: 5,
  },
  ingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ingName: {
    fontSize: 12,
  },
  ingKcal: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  modalSafe: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cancelText: { fontSize: 15 },
  saveText: { fontSize: 15, fontWeight: '700' },
  modalBody: {
    padding: Spacing.lg,
    paddingBottom: 50,
    gap: 14,
  },
  previewBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: Radii.md,
  },
  previewKcal: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  previewMacros: {
    fontSize: 12,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radii.full,
    borderWidth: 1,
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: Radii.sm + 2,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: Radii.md,
    borderWidth: 1,
    gap: 12,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  switchSub: {
    fontSize: 12,
    marginTop: 2,
  },
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  draftName: {
    fontSize: 14,
    fontWeight: '600',
  },
  draftSub: {
    fontSize: 12,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  stepper: {
    flexDirection: 'row',
    gap: 8,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: Radii.md,
    borderWidth: 1,
    gap: 10,
  },
});
