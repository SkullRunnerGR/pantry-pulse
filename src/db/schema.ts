/**
 * Offline-first SQLite relational schema for PantryPulse (iOS & Android via expo-sqlite).
 * Designed with UUID primary keys and updated_at/sync_status columns for seamless
 * PostgreSQL / Supabase delta synchronization.
 */
export const SQLITE_SCHEMA_STATEMENTS: string[] = [
  `PRAGMA foreign_keys = ON;`,

  `CREATE TABLE IF NOT EXISTS user_profiles (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    household_size INTEGER NOT NULL DEFAULT 2,
    daily_calorie_goal INTEGER NOT NULL DEFAULT 2150,
    protein_goal_g INTEGER NOT NULL DEFAULT 145,
    carbs_goal_g INTEGER NOT NULL DEFAULT 225,
    fat_goal_g INTEGER NOT NULL DEFAULT 70,
    fiber_goal_g INTEGER NOT NULL DEFAULT 32,
    preferred_shop_days_json TEXT NOT NULL DEFAULT '[3,6]',
    shop_lookahead_days INTEGER NOT NULL DEFAULT 6,
    min_trip_interval_days INTEGER NOT NULL DEFAULT 5,
    reminders_enabled INTEGER NOT NULL DEFAULT 1,
    reminder_hour INTEGER NOT NULL DEFAULT 9,
    updated_at TEXT NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY NOT NULL,
    barcode TEXT UNIQUE,
    name TEXT NOT NULL,
    brand TEXT,
    category TEXT NOT NULL,
    default_unit TEXT NOT NULL,
    default_package_qty REAL NOT NULL,
    serving_size REAL NOT NULL,
    serving_label TEXT NOT NULL,
    kcal_per_100 REAL NOT NULL,
    protein_per_100 REAL NOT NULL,
    carbs_per_100 REAL NOT NULL,
    fat_per_100 REAL NOT NULL,
    fiber_per_100 REAL NOT NULL,
    default_shelf_life_days INTEGER NOT NULL,
    storage_location TEXT NOT NULL,
    avg_unit_price REAL NOT NULL,
    aisle TEXT NOT NULL,
    is_staple INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY NOT NULL,
    merchant_name TEXT NOT NULL,
    purchased_at TEXT NOT NULL,
    subtotal REAL NOT NULL,
    tax REAL NOT NULL,
    total REAL NOT NULL,
    raw_ocr_text TEXT NOT NULL,
    parsed_item_count INTEGER NOT NULL DEFAULT 0
  );`,

  `CREATE TABLE IF NOT EXISTS inventory_batches (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT NOT NULL,
    receipt_id TEXT,
    initial_qty REAL NOT NULL,
    remaining_qty REAL NOT NULL,
    unit TEXT NOT NULL,
    purchased_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    storage_location TEXT NOT NULL,
    unit_cost REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    updated_at TEXT NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE SET NULL
  );`,

  `CREATE TABLE IF NOT EXISTS meal_logs (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    meal_type TEXT NOT NULL,
    title TEXT NOT NULL,
    logged_at TEXT NOT NULL,
    total_kcal REAL NOT NULL,
    total_protein_g REAL NOT NULL,
    total_carbs_g REAL NOT NULL,
    total_fat_g REAL NOT NULL,
    total_fiber_g REAL NOT NULL,
    notes TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
  );`,

  `CREATE TABLE IF NOT EXISTS meal_items (
    id TEXT PRIMARY KEY NOT NULL,
    meal_log_id TEXT NOT NULL,
    product_id TEXT,
    name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    kcal REAL NOT NULL,
    protein_g REAL NOT NULL,
    carbs_g REAL NOT NULL,
    fat_g REAL NOT NULL,
    fiber_g REAL NOT NULL,
    FOREIGN KEY (meal_log_id) REFERENCES meal_logs(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
  );`,

  `CREATE TABLE IF NOT EXISTS consumption_events (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    meal_log_id TEXT,
    quantity_delta REAL NOT NULL,
    unit TEXT NOT NULL,
    source TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (batch_id) REFERENCES inventory_batches(id) ON DELETE SET NULL,
    FOREIGN KEY (meal_log_id) REFERENCES meal_logs(id) ON DELETE SET NULL
  );`,

  `CREATE TABLE IF NOT EXISTS manual_shopping_items (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    aisle TEXT NOT NULL,
    recommended_qty REAL NOT NULL,
    packages_to_buy INTEGER NOT NULL DEFAULT 1,
    unit TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'optional',
    reason TEXT NOT NULL,
    estimated_price REAL NOT NULL DEFAULT 4.99,
    is_checked INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
  );`,

  `CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );`,

  `CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);`,
  `CREATE INDEX IF NOT EXISTS idx_batches_product_expiry ON inventory_batches(product_id, status, expires_at ASC);`,
  `CREATE INDEX IF NOT EXISTS idx_events_product_time ON consumption_events(product_id, occurred_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_meals_logged_at ON meal_logs(logged_at DESC);`,
];
