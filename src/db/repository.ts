import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  ConsumptionEvent,
  InventoryBatch,
  MealLog,
  Product,
  ReceiptRecord,
  ShoppingListItem,
  UserProfile,
} from '../domain/types';
import { SQLITE_SCHEMA_STATEMENTS } from './schema';
import { createSeedDataset, SeedDataset } from './seedData';

const WEB_STORAGE_KEY = 'pantrypulse_state_v1';
const DB_NAME = 'pantrypulse.db';

export interface PersistedState extends SeedDataset {
  checkedShoppingMap: Record<string, boolean>;
}

/**
 * Offline-first PantryPulse repository:
 * - On iOS & Android: uses expo-sqlite relational database with the full 9-table DDL schema.
 * - On Web: transparently persists to AsyncStorage/localStorage so the app runs seamlessly everywhere.
 */
class PantryRepository {
  private sqliteDb: import('expo-sqlite').SQLiteDatabase | null = null;
  private initialized = false;

  private async getSqliteDb(): Promise<import('expo-sqlite').SQLiteDatabase | null> {
    if (Platform.OS === 'web') return null;
    if (this.sqliteDb) return this.sqliteDb;

    const SQLite = await import('expo-sqlite');
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    for (const stmt of SQLITE_SCHEMA_STATEMENTS) {
      await db.execAsync(stmt);
    }
    this.sqliteDb = db;
    return db;
  }

  async loadOrSeed(): Promise<PersistedState> {
    if (Platform.OS === 'web') {
      return this.loadOrSeedWeb();
    }
    return this.loadOrSeedSqlite();
  }

  private async loadOrSeedWeb(): Promise<PersistedState> {
    try {
      const raw = await AsyncStorage.getItem(WEB_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        if (parsed && parsed.profile && Array.isArray(parsed.products)) {
          this.initialized = true;
          return parsed;
        }
      }
    } catch {
      // Fall through to seed
    }
    const seeded: PersistedState = {
      ...createSeedDataset(new Date()),
      checkedShoppingMap: {},
    };
    await this.saveAll(seeded);
    this.initialized = true;
    return seeded;
  }

  private async loadOrSeedSqlite(): Promise<PersistedState> {
    const db = await this.getSqliteDb();
    if (!db) return this.loadOrSeedWeb();

    const meta = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_meta WHERE key = 'seeded_v1'`
    );

    if (!meta) {
      const seeded: PersistedState = {
        ...createSeedDataset(new Date()),
        checkedShoppingMap: {},
      };
      await this.saveAllSqlite(db, seeded);
      await db.runAsync(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('seeded_v1', '1')`);
      this.initialized = true;
      return seeded;
    }

    const profileRow = await db.getFirstAsync<any>(`SELECT * FROM user_profiles LIMIT 1`);
    const productRows = await db.getAllAsync<any>(`SELECT * FROM products ORDER BY name ASC`);
    const batchRows = await db.getAllAsync<any>(
      `SELECT * FROM inventory_batches ORDER BY expires_at ASC`
    );
    const eventRows = await db.getAllAsync<any>(
      `SELECT * FROM consumption_events ORDER BY occurred_at DESC`
    );
    const mealRows = await db.getAllAsync<any>(`SELECT * FROM meal_logs ORDER BY logged_at DESC`);
    const mealItemRows = await db.getAllAsync<any>(`SELECT * FROM meal_items`);
    const receiptRows = await db.getAllAsync<any>(
      `SELECT * FROM receipts ORDER BY purchased_at DESC`
    );
    const manualRows = await db.getAllAsync<any>(`SELECT * FROM manual_shopping_items`);
    const checkedMeta = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_meta WHERE key = 'checked_shopping_map'`
    );

    const itemsByMeal = new Map<string, MealLog['items']>();
    for (const r of mealItemRows) {
      const arr = itemsByMeal.get(r.meal_log_id) ?? [];
      arr.push({
        id: r.id,
        mealLogId: r.meal_log_id,
        productId: r.product_id,
        name: r.name,
        quantity: r.quantity,
        unit: r.unit,
        kcal: r.kcal,
        proteinG: r.protein_g,
        carbsG: r.carbs_g,
        fatG: r.fat_g,
        fiberG: r.fiber_g,
      });
      itemsByMeal.set(r.meal_log_id, arr);
    }

    const fallback = createSeedDataset(new Date());

    const profile: UserProfile = profileRow
      ? {
          id: profileRow.id,
          name: profileRow.name,
          householdSize: profileRow.household_size,
          dailyCalorieGoal: profileRow.daily_calorie_goal,
          proteinGoalG: profileRow.protein_goal_g,
          carbsGoalG: profileRow.carbs_goal_g,
          fatGoalG: profileRow.fat_goal_g,
          fiberGoalG: profileRow.fiber_goal_g,
          preferredShopDays: JSON.parse(profileRow.preferred_shop_days_json || '[3,6]'),
          shopLookaheadDays: profileRow.shop_lookahead_days,
          minTripIntervalDays: profileRow.min_trip_interval_days,
          remindersEnabled: Boolean(profileRow.reminders_enabled),
          reminderHour: profileRow.reminder_hour,
          updatedAt: profileRow.updated_at,
        }
      : fallback.profile;

    const products: Product[] = productRows.map((r) => ({
      id: r.id,
      barcode: r.barcode,
      name: r.name,
      brand: r.brand,
      category: r.category,
      defaultUnit: r.default_unit,
      defaultPackageQty: r.default_package_qty,
      servingSize: r.serving_size,
      servingLabel: r.serving_label,
      kcalPer100: r.kcal_per_100,
      proteinPer100: r.protein_per_100,
      carbsPer100: r.carbs_per_100,
      fatPer100: r.fat_per_100,
      fiberPer100: r.fiber_per_100,
      defaultShelfLifeDays: r.default_shelf_life_days,
      storageLocation: r.storage_location,
      avgUnitPrice: r.avg_unit_price,
      aisle: r.aisle,
      isStaple: Boolean(r.is_staple),
      updatedAt: r.updated_at,
    }));

    const batches: InventoryBatch[] = batchRows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      receiptId: r.receipt_id,
      initialQty: r.initial_qty,
      remainingQty: r.remaining_qty,
      unit: r.unit,
      purchasedAt: r.purchased_at,
      expiresAt: r.expires_at,
      storageLocation: r.storage_location,
      unitCost: r.unit_cost,
      status: r.status,
      updatedAt: r.updated_at,
    }));

    const events: ConsumptionEvent[] = eventRows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      batchId: r.batch_id,
      mealLogId: r.meal_log_id,
      quantityDelta: r.quantity_delta,
      unit: r.unit,
      source: r.source,
      occurredAt: r.occurred_at,
      dayOfWeek: r.day_of_week,
    }));

    const meals: MealLog[] = mealRows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      mealType: r.meal_type,
      title: r.title,
      loggedAt: r.logged_at,
      items: itemsByMeal.get(r.id) ?? [],
      totalKcal: r.total_kcal,
      totalProteinG: r.total_protein_g,
      totalCarbsG: r.total_carbs_g,
      totalFatG: r.total_fat_g,
      totalFiberG: r.total_fiber_g,
      notes: r.notes,
      updatedAt: r.updated_at,
    }));

    const receipts: ReceiptRecord[] = receiptRows.map((r) => ({
      id: r.id,
      merchantName: r.merchant_name,
      purchasedAt: r.purchased_at,
      subtotal: r.subtotal,
      tax: r.tax,
      total: r.total,
      rawOcrText: r.raw_ocr_text,
      parsedItemCount: r.parsed_item_count,
    }));

    const manualShoppingItems: ShoppingListItem[] = manualRows.map((r) => ({
      id: r.id,
      tripId: 'manual',
      productId: r.product_id,
      name: r.name,
      category: r.category,
      aisle: r.aisle,
      recommendedQty: r.recommended_qty,
      packagesToBuy: r.packages_to_buy,
      unit: r.unit,
      priority: r.priority,
      reason: r.reason,
      estimatedPrice: r.estimated_price,
      isChecked: Boolean(r.is_checked),
      source: 'manual',
    }));

    this.initialized = true;
    return {
      profile,
      products,
      batches,
      events,
      meals,
      receipts,
      manualShoppingItems,
      checkedShoppingMap: checkedMeta ? JSON.parse(checkedMeta.value) : {},
    };
  }

  async saveAll(state: PersistedState): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(state));
      return;
    }
    const db = await this.getSqliteDb();
    if (!db) {
      await AsyncStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(state));
      return;
    }
    await this.saveAllSqlite(db, state);
  }

  private async saveAllSqlite(
    db: import('expo-sqlite').SQLiteDatabase,
    state: PersistedState
  ): Promise<void> {
    await db.withTransactionAsync(async () => {
      const p = state.profile;
      await db.runAsync(
        `INSERT OR REPLACE INTO user_profiles
         (id, name, household_size, daily_calorie_goal, protein_goal_g, carbs_goal_g, fat_goal_g, fiber_goal_g,
          preferred_shop_days_json, shop_lookahead_days, min_trip_interval_days, reminders_enabled, reminder_hour, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id,
          p.name,
          p.householdSize,
          p.dailyCalorieGoal,
          p.proteinGoalG,
          p.carbsGoalG,
          p.fatGoalG,
          p.fiberGoalG,
          JSON.stringify(p.preferredShopDays),
          p.shopLookaheadDays,
          p.minTripIntervalDays,
          p.remindersEnabled ? 1 : 0,
          p.reminderHour,
          p.updatedAt,
        ]
      );

      for (const prod of state.products) {
        await db.runAsync(
          `INSERT OR REPLACE INTO products
           (id, barcode, name, brand, category, default_unit, default_package_qty, serving_size, serving_label,
            kcal_per_100, protein_per_100, carbs_per_100, fat_per_100, fiber_per_100, default_shelf_life_days,
            storage_location, avg_unit_price, aisle, is_staple, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            prod.id,
            prod.barcode ?? null,
            prod.name,
            prod.brand ?? null,
            prod.category,
            prod.defaultUnit,
            prod.defaultPackageQty,
            prod.servingSize,
            prod.servingLabel,
            prod.kcalPer100,
            prod.proteinPer100,
            prod.carbsPer100,
            prod.fatPer100,
            prod.fiberPer100,
            prod.defaultShelfLifeDays,
            prod.storageLocation,
            prod.avgUnitPrice,
            prod.aisle,
            prod.isStaple ? 1 : 0,
            prod.updatedAt,
          ]
        );
      }

      for (const r of state.receipts) {
        await db.runAsync(
          `INSERT OR REPLACE INTO receipts
           (id, merchant_name, purchased_at, subtotal, tax, total, raw_ocr_text, parsed_item_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [r.id, r.merchantName, r.purchasedAt, r.subtotal, r.tax, r.total, r.rawOcrText, r.parsedItemCount]
        );
      }

      await db.runAsync(`DELETE FROM inventory_batches`);
      for (const b of state.batches) {
        await db.runAsync(
          `INSERT INTO inventory_batches
           (id, product_id, receipt_id, initial_qty, remaining_qty, unit, purchased_at, expires_at, storage_location, unit_cost, status, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            b.id,
            b.productId,
            b.receiptId ?? null,
            b.initialQty,
            b.remainingQty,
            b.unit,
            b.purchasedAt,
            b.expiresAt,
            b.storageLocation,
            b.unitCost,
            b.status,
            b.updatedAt,
          ]
        );
      }

      await db.runAsync(`DELETE FROM meal_items`);
      await db.runAsync(`DELETE FROM meal_logs`);
      for (const m of state.meals) {
        await db.runAsync(
          `INSERT INTO meal_logs
           (id, user_id, meal_type, title, logged_at, total_kcal, total_protein_g, total_carbs_g, total_fat_g, total_fiber_g, notes, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            m.id,
            m.userId,
            m.mealType,
            m.title,
            m.loggedAt,
            m.totalKcal,
            m.totalProteinG,
            m.totalCarbsG,
            m.totalFatG,
            m.totalFiberG,
            m.notes ?? null,
            m.updatedAt,
          ]
        );
        for (const item of m.items) {
          await db.runAsync(
            `INSERT INTO meal_items
             (id, meal_log_id, product_id, name, quantity, unit, kcal, protein_g, carbs_g, fat_g, fiber_g)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              item.id,
              m.id,
              item.productId ?? null,
              item.name,
              item.quantity,
              item.unit,
              item.kcal,
              item.proteinG,
              item.carbsG,
              item.fatG,
              item.fiberG,
            ]
          );
        }
      }

      await db.runAsync(`DELETE FROM consumption_events`);
      for (const e of state.events) {
        await db.runAsync(
          `INSERT INTO consumption_events
           (id, product_id, batch_id, meal_log_id, quantity_delta, unit, source, occurred_at, day_of_week)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            e.id,
            e.productId,
            e.batchId ?? null,
            e.mealLogId ?? null,
            e.quantityDelta,
            e.unit,
            e.source,
            e.occurredAt,
            e.dayOfWeek,
          ]
        );
      }

      await db.runAsync(`DELETE FROM manual_shopping_items`);
      for (const item of state.manualShoppingItems) {
        await db.runAsync(
          `INSERT INTO manual_shopping_items
           (id, product_id, name, category, aisle, recommended_qty, packages_to_buy, unit, priority, reason, estimated_price, is_checked)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.productId ?? null,
            item.name,
            item.category,
            item.aisle,
            item.recommendedQty,
            item.packagesToBuy,
            item.unit,
            item.priority,
            item.reason,
            item.estimatedPrice,
            item.isChecked ? 1 : 0,
          ]
        );
      }

      await db.runAsync(
        `INSERT OR REPLACE INTO app_meta (key, value) VALUES ('checked_shopping_map', ?)`,
        [JSON.stringify(state.checkedShoppingMap)]
      );
    });
  }

  async resetToDemo(): Promise<PersistedState> {
    const fresh: PersistedState = {
      ...createSeedDataset(new Date()),
      checkedShoppingMap: {},
    };
    await this.saveAll(fresh);
    return fresh;
  }

  isReady(): boolean {
    return this.initialized;
  }
}

export const pantryRepository = new PantryRepository();
