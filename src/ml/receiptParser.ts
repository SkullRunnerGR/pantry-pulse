import { CATEGORY_PRIORS } from '../domain/catalog';
import { BaseUnit, FoodCategory, ParsedReceipt, ParsedReceiptLine, Product } from '../domain/types';

const ABBREVIATION_MAP: Record<string, string> = {
  ORG: 'Organic',
  ORGN: 'Organic',
  GRK: 'Greek',
  YGRT: 'Yogurt',
  YOG: 'Yogurt',
  WHL: 'Whole',
  MLK: 'Milk',
  CHKN: 'Chicken',
  CHK: 'Chicken',
  BRST: 'Breast',
  BNLS: 'Boneless',
  BNS: 'Boneless',
  SLMN: 'Salmon',
  SPNCH: 'Spinach',
  BBY: 'Baby',
  BLBRY: 'Blueberries',
  BLUBRY: 'Blueberries',
  AVOC: 'Avocados',
  AVO: 'Avocados',
  BAN: 'Bananas',
  BNNA: 'Bananas',
  BRWN: 'Brown',
  SRDGH: 'Sourdough',
  BRD: 'Bread',
  EVOO: 'Extra Virgin Olive Oil',
  OLV: 'Olive',
  ALMND: 'Almonds',
  ALMNDS: 'Almonds',
  ESPR: 'Espresso',
  COFF: 'Coffee',
  PAST: 'Pasture',
  LRG: 'Large',
  LG: 'Large',
  OATMLK: 'Oat Milk',
  RLD: 'Rolled',
  JASM: 'Jasmine',
  PK: 'Pack',
  CT: 'Count',
  DZ: 'Dozen',
  STRWBRY: 'Strawberries',
  TOM: 'Tomatoes',
  CHZ: 'Cheese',
  BTR: 'Butter',
  PSTA: 'Pasta',
  BROC: 'Broccoli',
  APPL: 'Apples',
  ORNG: 'Oranges',
  GRN: 'Green',
};

const SKIP_LINE_PATTERNS = [
  /^\s*$/,
  /subtotal/i,
  /sub-total/i,
  /sales\s*tax/i,
  /^\s*tax\b/i,
  /\btotal\b/i,
  /balance\s*due/i,
  /visa|mastercard|amex|discover|debit|credit|apple\s*pay|change\s*due|tender|approved|auth\s*code|chip\s*read/i,
  /thank\s*you|receipt|store\s*#|cashier|register|member|loyalty|savings|rewards|you\s*saved|items\s*sold/i,
  /^[-=*_.#\s]{3,}$/,
  /^\d{3}[-.)\s]\d{3}[-.\s]\d{4}/, // phone numbers
  /^\d{1,2}\/\d{1,2}\/\d{2,4}/,     // standalone date/time line
  /^\d{1,2}:\d{2}\s*(am|pm)?$/i,    // standalone timestamp
  /^#\d+$/,                         // store or lane number
];

const STANDALONE_PRICE_RE = /^\s*\$?\s*(\d{1,3}\.\d{2})\s*[A-Z]?\s*$/;
const INLINE_PRICE_RE = /\$?\s*(\d{1,3}\.\d{2})\s*[A-Z]?\s*$/;

/**
 * Normalizes raw text blocks returned by Apple Vision (iOS) or Google ML Kit (Android)
 * into clean receipt lines, stitching together:
 *  1. Adjacent pairs where line i is an item description and line i+1 is a standalone price.
 *  2. Column-split OCR blocks where all item descriptions appear in one column block
 *     and all corresponding prices appear in a separate right-hand column block.
 */
export function reconstructOcrLines(rawBlocks: string[]): string {
  const flatLines = rawBlocks
    .flatMap((block) => block.split(/\r?\n/))
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (flatLines.length === 0) return '';

  // Pass 1: Check for adjacent [description, standalone price] pairs
  const stitched: string[] = [];
  const orphanDescIndices: number[] = [];
  const orphanPrices: string[] = [];

  for (let i = 0; i < flatLines.length; i++) {
    const cur = flatLines[i];
    const next = flatLines[i + 1];

    // Already has a trailing price (and isn't solely a price)
    if (INLINE_PRICE_RE.test(cur) && !STANDALONE_PRICE_RE.test(cur)) {
      stitched.push(cur);
      continue;
    }

    // Current is non-price text and immediately followed by a single standalone price
    // (NOT a multi-price right-hand column run while we already have earlier unpaired descriptions)
    const nextNextIsPrice = Boolean(flatLines[i + 2] && STANDALONE_PRICE_RE.test(flatLines[i + 2]));
    const isColumnSplitTransition = orphanDescIndices.length > 0 && nextNextIsPrice;

    if (
      !STANDALONE_PRICE_RE.test(cur) &&
      next &&
      STANDALONE_PRICE_RE.test(next) &&
      !isColumnSplitTransition &&
      !/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(cur)
    ) {
      stitched.push(`${cur}  ${next.trim()}`);
      i += 1;
      continue;
    }

    // Standalone price that wasn't immediately preceded by an unpaired description
    if (STANDALONE_PRICE_RE.test(cur)) {
      orphanPrices.push(cur.trim());
      continue;
    }

    // Plain text line (could be header, footer, or column-split product description)
    const idx = stitched.length;
    stitched.push(cur);
    if (
      idx > 0 && // skip merchant header at line 0
      !SKIP_LINE_PATTERNS.some((re) => re.test(cur)) &&
      /[a-zA-Z]{2,}/.test(cur)
    ) {
      orphanDescIndices.push(idx);
    }
  }

  // Pass 2: If ML Kit / Apple Vision returned a right-hand price column separately,
  // pair trailing orphan prices with orphan product descriptions in order.
  if (orphanPrices.length > 0 && orphanDescIndices.length > 0) {
    // Only take as many prices as orphan descriptions (trailing prices may include subtotal/total)
    const pairCount = Math.min(orphanDescIndices.length, orphanPrices.length);
    for (let k = 0; k < pairCount; k++) {
      const targetIdx = orphanDescIndices[k];
      stitched[targetIdx] = `${stitched[targetIdx]}  ${orphanPrices[k]}`;
    }
  }

  return stitched.join('\n');
}

function bigrams(str: string): Set<string> {
  const clean = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const set = new Set<string>();
  for (let i = 0; i < clean.length - 1; i++) {
    set.add(clean.slice(i, i + 2));
  }
  return set;
}

function diceSimilarity(a: string, b: string): number {
  const bgA = bigrams(a);
  const bgB = bigrams(b);
  if (bgA.size === 0 || bgB.size === 0) return 0;
  let intersect = 0;
  for (const g of bgA) {
    if (bgB.has(g)) intersect++;
  }
  return (2 * intersect) / (bgA.size + bgB.size);
}

function tokenJaccard(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter((t) => t.length > 1));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter((t) => t.length > 1));
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const t of setA) {
    if (setB.has(t)) inter++;
  }
  const union = new Set([...setA, ...setB]).size;
  return inter / union;
}

export function expandReceiptAbbreviations(raw: string): string {
  const tokens = raw
    .replace(/[*#@_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');

  return tokens
    .map((tok) => {
      const upper = tok.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (ABBREVIATION_MAP[upper]) return ABBREVIATION_MAP[upper];
      if (tok.length <= 1) return tok;
      return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferCategoryFromName(name: string): FoodCategory {
  const lower = name.toLowerCase();
  if (/milk|yogurt|cheese|butter|egg|cream|kefir/.test(lower)) return 'dairy';
  if (/chicken|salmon|beef|turkey|tofu|pork|shrimp|steak|tuna/.test(lower)) return 'protein';
  if (
    /spinach|berry|berries|avocado|banana|apple|kale|tomato|broccoli|lettuce|carrot|onion|pepper|orange|strawberr/.test(
      lower
    )
  ) {
    return 'produce';
  }
  if (/oat|rice|pasta|quinoa|flour|cereal|barley/.test(lower)) return 'grains';
  if (/bread|sourdough|bagel|tortilla|bun|muffin|croissant/.test(lower)) return 'bakery';
  if (/coffee|espresso|tea|juice|soda|water|kombucha|oat milk|almond milk/.test(lower)) {
    return 'beverages';
  }
  if (/frozen|ice cream/.test(lower)) return 'frozen';
  if (/almond|nut|chip|cracker|bar|chocolate|popcorn/.test(lower)) return 'snacks';
  return 'pantry';
}

function extractPackQuantityAndUnit(
  text: string,
  matchedProduct: Product | null
): { quantity: number; unit: BaseUnit; cleanedText: string } {
  let multiplier = 1;
  let working = text;

  const multMatch = working.match(/^\s*(\d+)\s*[xX@]\s+/);
  if (multMatch) {
    multiplier = parseInt(multMatch[1], 10) || 1;
    working = working.slice(multMatch[0].length);
  }

  // Handle weighted produce/meat lines like "1.42 lb @ 4.99/lb"
  const weightAtMatch = working.match(/(\d+(?:\.\d+)?)\s*(lb|lbs|kg|oz)\s*@\s*\$?\d+\.\d{2}/i);
  if (weightAtMatch) {
    const val = parseFloat(weightAtMatch[1]);
    const u = weightAtMatch[2].toLowerCase();
    const cleanedText = working.replace(weightAtMatch[0], '').replace(/\s+/g, ' ').trim();
    if (u === 'kg') return { quantity: Math.round(val * 1000), unit: 'g', cleanedText };
    if (u === 'oz') return { quantity: Math.round(val * 28.35), unit: 'g', cleanedText };
    return { quantity: Math.round(val * 453.59), unit: 'g', cleanedText };
  }

  const sizeRegex = /\b(\d+(?:\.\d+)?)\s*(fl\s*oz|oz|lb|lbs|kg|g|ml|l|ct|pk|dz|dozen|gal)\b/i;
  const sizeMatch = working.match(sizeRegex);

  if (sizeMatch) {
    const val = parseFloat(sizeMatch[1]) * multiplier;
    const rawUnit = sizeMatch[2].toLowerCase().replace(/\s+/g, '');
    const cleanedText = working.replace(sizeRegex, '').replace(/\s+/g, ' ').trim();

    if (rawUnit === 'g') return { quantity: Math.round(val), unit: 'g', cleanedText };
    if (rawUnit === 'kg') return { quantity: Math.round(val * 1000), unit: 'g', cleanedText };
    if (rawUnit === 'lb' || rawUnit === 'lbs') {
      return { quantity: Math.round(val * 453.59), unit: 'g', cleanedText };
    }
    if (rawUnit === 'ml') return { quantity: Math.round(val), unit: 'ml', cleanedText };
    if (rawUnit === 'l') return { quantity: Math.round(val * 1000), unit: 'ml', cleanedText };
    if (rawUnit === 'gal') return { quantity: Math.round(val * 3785), unit: 'ml', cleanedText };
    if (rawUnit === 'floz') return { quantity: Math.round(val * 29.57), unit: 'ml', cleanedText };
    if (rawUnit === 'oz') {
      if (matchedProduct?.defaultUnit === 'ml' || /milk|juice|oil|broth|water/i.test(cleanedText)) {
        return { quantity: Math.round(val * 29.57), unit: 'ml', cleanedText };
      }
      return { quantity: Math.round(val * 28.35), unit: 'g', cleanedText };
    }
    if (rawUnit === 'dz' || rawUnit === 'dozen') {
      return { quantity: Math.round(val * 12), unit: 'count', cleanedText };
    }
    if (rawUnit === 'ct' || rawUnit === 'pk') {
      return { quantity: Math.round(val), unit: 'count', cleanedText };
    }
  }

  if (matchedProduct) {
    return {
      quantity: Math.round(matchedProduct.defaultPackageQty * multiplier * 10) / 10,
      unit: matchedProduct.defaultUnit,
      cleanedText: working.trim(),
    };
  }

  return {
    quantity: 500 * multiplier,
    unit: 'g',
    cleanedText: working.trim(),
  };
}

function matchProductInCatalog(
  normalizedName: string,
  catalog: Product[]
): { product: Product | null; score: number } {
  let bestProduct: Product | null = null;
  let bestScore = 0;

  for (const product of catalog) {
    const candidate = `${product.name} ${product.brand ?? ''}`.trim();
    const score =
      0.55 * tokenJaccard(normalizedName, product.name) +
      0.35 * diceSimilarity(normalizedName, product.name) +
      0.10 * diceSimilarity(normalizedName, candidate);

    if (score > bestScore) {
      bestScore = score;
      bestProduct = product;
    }
  }

  if (bestScore >= 0.34 && bestProduct) {
    return { product: bestProduct, score: Math.round(bestScore * 100) / 100 };
  }
  return { product: null, score: 0 };
}

/**
 * Parses raw receipt OCR text (or reconstructed Vision/ML Kit blocks) into structured
 * line items mapped to canonical PantryPulse products, quantities, prices, and shelf life.
 */
export function parseReceiptText(rawText: string, catalog: Product[]): ParsedReceipt {
  // Run reconstruction so even pasted two-column OCR text stitches cleanly
  const normalizedInput = reconstructOcrLines([rawText]);
  const lines = normalizedInput
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let merchantName = 'Local Grocery Market';
  for (let i = 0; i < Math.min(3, lines.length); i++) {
    if (
      !/\$\d|\d+\.\d{2}/.test(lines[i]) &&
      lines[i].length >= 3 &&
      !/^\d{1,2}\/\d{1,2}/.test(lines[i])
    ) {
      merchantName = lines[i].replace(/[*#=]+/g, '').trim();
      break;
    }
  }

  let purchasedAt = new Date().toISOString();
  const dateMatch = rawText.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
  if (dateMatch) {
    const parsedDate = new Date(dateMatch[1]);
    if (!Number.isNaN(parsedDate.getTime())) {
      purchasedAt = parsedDate.toISOString();
    }
  }

  let subtotal = 0;
  let tax = 0;
  let total = 0;

  const parsedLines: ParsedReceiptLine[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    const subMatch = line.match(/sub-?total.*?\$?\s*(\d+\.\d{2})/i);
    if (subMatch) {
      subtotal = parseFloat(subMatch[1]);
      continue;
    }
    const taxMatch = line.match(/\btax\b.*?\$?\s*(\d+\.\d{2})/i);
    if (taxMatch) {
      tax = parseFloat(taxMatch[1]);
      continue;
    }
    const totalMatch = line.match(/^\s*(?:grand\s*)?total\b.*?\$?\s*(\d+\.\d{2})/i);
    if (totalMatch) {
      total = parseFloat(totalMatch[1]);
      continue;
    }

    if (idx === 0 && line.includes(merchantName)) continue;
    if (SKIP_LINE_PATTERNS.some((re) => re.test(line))) continue;

    const priceMatch = line.match(INLINE_PRICE_RE);
    if (!priceMatch) continue;

    const price = parseFloat(priceMatch[1]);
    if (price <= 0 || price > 250) continue;

    const rawDesc = line.slice(0, priceMatch.index).replace(/\s+\d{5,}\s*$/, '').trim();
    if (rawDesc.length < 2 || !/[a-zA-Z]/.test(rawDesc)) continue;

    const expanded = expandReceiptAbbreviations(rawDesc);
    const preliminaryMatch = matchProductInCatalog(expanded, catalog);
    const { quantity, unit, cleanedText } = extractPackQuantityAndUnit(
      expanded,
      preliminaryMatch.product
    );
    const finalMatch = matchProductInCatalog(cleanedText || expanded, catalog);
    const matched = finalMatch.product ?? preliminaryMatch.product;
    const confidence = Math.max(finalMatch.score, preliminaryMatch.score);

    const category = matched?.category ?? inferCategoryFromName(cleanedText || expanded);
    const prior = CATEGORY_PRIORS[category];

    parsedLines.push({
      id: `rline_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      rawLine: line,
      normalizedName: matched ? matched.name : cleanedText || expanded,
      matchedProductId: matched?.id ?? null,
      matchedProductName: matched?.name ?? null,
      matchConfidence: confidence,
      quantity,
      unit,
      price,
      category,
      storageLocation: matched?.storageLocation ?? prior.defaultStorage,
      estimatedShelfLifeDays: matched?.defaultShelfLifeDays ?? prior.defaultShelfLifeDays,
      kcalPer100: matched?.kcalPer100 ?? prior.defaultKcalPer100,
      selected: true,
    });
  }

  const computedSub =
    Math.round(parsedLines.reduce((acc, l) => acc + l.price, 0) * 100) / 100;
  if (subtotal === 0) subtotal = computedSub;
  if (total === 0) total = Math.round((subtotal + tax) * 100) / 100;

  return {
    merchantName,
    purchasedAt,
    subtotal,
    tax,
    total,
    lines: parsedLines,
  };
}
