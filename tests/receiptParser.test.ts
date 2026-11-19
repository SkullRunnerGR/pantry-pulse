import { describe, expect, it } from 'vitest';
import { DEFAULT_PRODUCTS } from '../src/domain/catalog';
import {
  expandReceiptAbbreviations,
  parseReceiptText,
  reconstructOcrLines,
} from '../src/ml/receiptParser';

describe('Receipt OCR Parser & Catalog Matcher', () => {
  it('expands common grocery POS abbreviations cleanly', () => {
    expect(expandReceiptAbbreviations('ORG GRK YGRT')).toBe('Organic Greek Yogurt');
    expect(expandReceiptAbbreviations('BNLS CHKN BRST')).toBe('Boneless Chicken Breast');
  });

  it('parses single-line receipts, extracts prices/units, filters totals, and matches catalog products', () => {
    const rawReceipt = [
      "TRADER JOE'S #142",
      '11/19/2026 05:42 PM',
      'ORG WHL MLK 64OZ                5.99',
      'PAST LRG EGGS 1DZ               6.99',
      'ORG BBY SPNCH 10OZ              4.49',
      'BNLS CHKN BRST 2LB              9.99',
      'SUBTOTAL                       27.46',
      'TAX                             0.00',
      'TOTAL                          27.46',
      'VISA **** 4242                 27.46',
    ].join('\n');

    const parsed = parseReceiptText(rawReceipt, DEFAULT_PRODUCTS);
    expect(parsed.merchantName).toContain("TRADER JOE'S");
    expect(parsed.lines).toHaveLength(4);
    expect(parsed.total).toBeCloseTo(27.46, 2);

    const milkLine = parsed.lines[0];
    expect(milkLine.matchedProductId).toBe('prod_milk');
    expect(milkLine.unit).toBe('ml');
    expect(milkLine.quantity).toBeGreaterThan(1800);

    const eggsLine = parsed.lines[1];
    expect(eggsLine.matchedProductId).toBe('prod_eggs');
    expect(eggsLine.unit).toBe('count');
    expect(eggsLine.quantity).toBe(12);

    const chickenLine = parsed.lines[3];
    expect(chickenLine.matchedProductId).toBe('prod_chicken');
    expect(chickenLine.unit).toBe('g');
    expect(chickenLine.quantity).toBeGreaterThan(900);
  });

  it('reconstructs Apple Vision / ML Kit adjacent split-line OCR blocks', () => {
    const visionBlocks = [
      'WHOLE FOODS MARKET',
      'ORG WHL MLK 64OZ',
      '$5.99 F',
      'ORG BBY SPNCH 10OZ',
      '$4.49 F',
      'PAST LRG EGGS 1DZ',
      '6.99',
      'TOTAL',
      '17.47',
    ];

    const reconstructed = reconstructOcrLines(visionBlocks);
    const parsed = parseReceiptText(reconstructed, DEFAULT_PRODUCTS);
    expect(parsed.lines).toHaveLength(3);
    expect(parsed.lines[0].matchedProductId).toBe('prod_milk');
    expect(parsed.lines[1].matchedProductId).toBe('prod_spinach');
    expect(parsed.lines[2].matchedProductId).toBe('prod_eggs');
  });

  it('reconstructs two-column ML Kit receipt blocks (left descriptions, right price column)', () => {
    const mlKitBlocks = [
      "TRADER JOE'S\nORG GRK YGRT 32OZ\nFRESH BLBRY 12OZ\nHASS AVOC 4CT",
      '6.49\n4.99\n5.49',
    ];

    const reconstructed = reconstructOcrLines(mlKitBlocks);
    const parsed = parseReceiptText(reconstructed, DEFAULT_PRODUCTS);
    expect(parsed.lines).toHaveLength(3);
    expect(parsed.lines[0].matchedProductId).toBe('prod_yogurt');
    expect(parsed.lines[0].price).toBeCloseTo(6.49, 2);
    expect(parsed.lines[1].matchedProductId).toBe('prod_blueberries');
    expect(parsed.lines[2].matchedProductId).toBe('prod_avocado');
  });
});
