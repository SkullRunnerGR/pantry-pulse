import { CATEGORY_PRIORS, findCatalogProductByBarcode } from '../domain/catalog';
import { BaseUnit, FoodCategory, Product } from '../domain/types';

export interface BarcodeLookupResult {
  found: boolean;
  source: 'local_catalog' | 'open_food_facts' | 'not_found';
  product?: Product;
  barcode: string;
}

function mapOffCategory(tags: string[] = []): FoodCategory {
  const joined = tags.join(' ').toLowerCase();
  if (/milk|yogurt|dairy|cheese|egg/.test(joined)) return 'dairy';
  if (/meat|poultry|fish|seafood|chicken|salmon|protein/.test(joined)) return 'protein';
  if (/fruit|vegetable|produce|salad|spinach|berry/.test(joined)) return 'produce';
  if (/bread|bakery|pastry/.test(joined)) return 'bakery';
  if (/beverage|drink|coffee|tea|juice|oat-drink/.test(joined)) return 'beverages';
  if (/frozen/.test(joined)) return 'frozen';
  if (/snack|nut|chip|chocolate/.test(joined)) return 'snacks';
  if (/cereal|oat|rice|pasta|grain/.test(joined)) return 'grains';
  return 'pantry';
}

function parsePackageQty(quantityText: string | undefined, defaultUnit: BaseUnit): number {
  if (!quantityText) return defaultUnit === 'count' ? 6 : 500;
  const m = quantityText.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|oz|fl\s*oz|lb|ct)/i);
  if (!m) return defaultUnit === 'count' ? 6 : 500;
  const val = parseFloat(m[1]);
  const unit = m[2].toLowerCase().replace(/\s+/g, '');
  if (unit === 'kg' || unit === 'l') return Math.round(val * 1000);
  if (unit === 'oz') return Math.round(val * 28.35);
  if (unit === 'floz') return Math.round(val * 29.57);
  if (unit === 'lb') return Math.round(val * 453.59);
  return Math.round(val);
}

/**
 * Looks up a scanned EAN/UPC barcode:
 * 1. Checks the user's local product table first (zero latency, works offline)
 * 2. Checks the built-in grocery catalog
 * 3. Falls back to the Open Food Facts v2 API for live nutrition lookup
 */
export async function lookupBarcode(
  rawBarcode: string,
  localProducts: Product[]
): Promise<BarcodeLookupResult> {
  const barcode = rawBarcode.replace(/\D/g, '');
  if (!barcode) {
    return { found: false, source: 'not_found', barcode: rawBarcode };
  }

  // 1. Check user's local products
  const localHit = localProducts.find(
    (p) => p.barcode && p.barcode.replace(/\D/g, '') === barcode
  );
  if (localHit) {
    return { found: true, source: 'local_catalog', product: localHit, barcode };
  }

  // 2. Check built-in default catalog
  const catalogHit = findCatalogProductByBarcode(barcode);
  if (catalogHit) {
    return { found: true, source: 'local_catalog', product: catalogHit, barcode };
  }

  // 3. Query Open Food Facts API v2 (with strict timeout so UX stays snappy)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,categories_tags,quantity,serving_quantity,nutriments`,
      {
        signal: controller.signal,
        headers: {
          'User-Agent': 'PantryPulse/1.0 (iOS/Android)',
        },
      }
    );
    clearTimeout(timer);

    if (!res.ok) {
      return { found: false, source: 'not_found', barcode };
    }
    const json = await res.json();
    if (json.status !== 1 || !json.product?.product_name) {
      return { found: false, source: 'not_found', barcode };
    }

    const p = json.product;
    const category = mapOffCategory(p.categories_tags);
    const prior = CATEGORY_PRIORS[category];
    const defaultUnit: BaseUnit = category === 'beverages' ? 'ml' : 'g';
    const nut = p.nutriments ?? {};
    const pkgQty = parsePackageQty(p.quantity, defaultUnit);
    const servingSize = Math.max(15, Number(p.serving_quantity) || Math.round(pkgQty / 5));

    const product: Product = {
      id: `prod_off_${barcode}`,
      barcode,
      name: String(p.product_name).trim(),
      brand: p.brands ? String(p.brands).split(',')[0].trim() : null,
      category,
      defaultUnit,
      defaultPackageQty: pkgQty,
      servingSize,
      servingLabel: `1 serving (${servingSize} ${defaultUnit})`,
      kcalPer100: Math.round(Number(nut['energy-kcal_100g'] ?? prior.defaultKcalPer100)),
      proteinPer100: Math.round(Number(nut.proteins_100g ?? 4) * 10) / 10,
      carbsPer100: Math.round(Number(nut.carbohydrates_100g ?? 12) * 10) / 10,
      fatPer100: Math.round(Number(nut.fat_100g ?? 3) * 10) / 10,
      fiberPer100: Math.round(Number(nut.fiber_100g ?? 1.5) * 10) / 10,
      defaultShelfLifeDays: prior.defaultShelfLifeDays,
      storageLocation: prior.defaultStorage,
      avgUnitPrice: 5.49,
      aisle: prior.defaultAisle,
      isStaple: false,
      updatedAt: new Date().toISOString(),
    };

    return { found: true, source: 'open_food_facts', product, barcode };
  } catch {
    return { found: false, source: 'not_found', barcode };
  }
}

export const DEMO_BARCODES = [
  { barcode: '0041900076641', label: 'Horizon Organic Whole Milk (64 oz)' },
  { barcode: '0894700010045', label: 'Fage Greek Yogurt 2% (32 oz)' },
  { barcode: '0815652000014', label: 'Vital Farms Pasture Eggs (12 ct)' },
  { barcode: '0032601025617', label: 'Earthbound Organic Baby Spinach' },
  { barcode: '0190646630082', label: 'Oatly Barista Oat Milk (32 oz)' },
];
