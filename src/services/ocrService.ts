import { Platform } from 'react-native';
import { ParsedReceipt, Product } from '../domain/types';
import { parseReceiptText, reconstructOcrLines } from '../ml/receiptParser';

export interface SampleReceiptPreset {
  id: string;
  label: string;
  merchant: string;
  rawText: string;
}

export type OcrEngineType =
  | 'apple_vision'
  | 'google_mlkit'
  | 'tesseract_web'
  | 'google_cloud_vision'
  | 'custom_endpoint';

export interface ReceiptOcrResult {
  rawText: string;
  parsed: ParsedReceipt;
  engine: OcrEngineType;
  engineLabel: string;
}

export const SAMPLE_RECEIPTS: SampleReceiptPreset[] = [
  {
    id: 'trader_joes',
    label: "Trader Joe's Weekly Run",
    merchant: "Trader Joe's #142",
    rawText: [
      "TRADER JOE'S #142",
      '11/19/2026 05:42 PM',
      'ORG WHL MLK 64OZ                5.99',
      'PAST LRG EGGS 1DZ               6.99',
      'ORG BBY SPNCH 10OZ              4.49',
      'FRESH BLBRY 12OZ                4.99',
      'ORG GRK YGRT 32OZ               6.49',
      'BNLS CHKN BRST 2LB              9.99',
      'HASS AVOC 4CT                   5.49',
      'SUBTOTAL                       44.43',
      'TAX                             0.00',
      'TOTAL                          44.43',
    ].join('\n'),
  },
  {
    id: 'whole_foods',
    label: 'Whole Foods Restock',
    merchant: 'Whole Foods Market',
    rawText: [
      'WHOLE FOODS MARKET',
      '11/19/2026 11:15 AM',
      'WILD SOCKEYE SLMN 1.5LB        14.99',
      'ESPR COFF BEANS 12OZ           15.50',
      'BARISTA OATMLK 32FL OZ          4.99',
      'SPROUTED SRDGH BRD 16CT         5.79',
      'ORG BAN 6CT                     2.29',
      'RLD OATS 32OZ                   5.49',
      'SUBTOTAL                       49.05',
      'TAX                             0.00',
      'TOTAL                          49.05',
    ].join('\n'),
  },
];

/**
 * Normalizes an image URI for expo-text-extractor:
 * - On Android, ExpoTextExtractorModule passes non-content:// strings directly to java.io.File(),
 *   so a "file://" prefix MUST be stripped into an absolute filesystem path.
 * - On iOS, Vision reads via Data(contentsOf: URL), which requires the file:// URL intact.
 */
function normalizeNativeOcrUri(imageUri: string): string {
  if (Platform.OS === 'android') {
    if (imageUri.startsWith('file://')) {
      return decodeURIComponent(imageUri.replace(/^file:\/\//, ''));
    }
    return imageUri;
  }
  return imageUri;
}

/**
 * Runs real on-device or cloud OCR on a photographed/imported grocery receipt image:
 *  1. Optional custom OCR server (EXPO_PUBLIC_OCR_ENDPOINT)
 *  2. Optional Google Cloud Vision API (EXPO_PUBLIC_GOOGLE_VISION_API_KEY + base64)
 *  3. Native iOS Apple Vision / Android Google ML Kit via expo-text-extractor (zero API keys, offline!)
 *  4. Web Tesseract.js OCR fallback
 */
export async function extractReceiptFromImage(
  imageUri: string,
  catalog: Product[],
  options?: { base64?: string | null }
): Promise<ReceiptOcrResult> {
  // 1. Optional Custom Cloud OCR Endpoint
  const endpoint = process.env.EXPO_PUBLIC_OCR_ENDPOINT;
  if (endpoint) {
    const form = new FormData();
    form.append('file', {
      uri: imageUri,
      name: 'receipt.jpg',
      type: 'image/jpeg',
    } as any);
    const response = await fetch(endpoint, { method: 'POST', body: form });
    if (response.ok) {
      const payload = await response.json();
      const text = String(payload.text ?? '').trim();
      if (text.length > 0) {
        return {
          rawText: text,
          parsed: parseReceiptText(text, catalog),
          engine: 'custom_endpoint',
          engineLabel: 'Cloud OCR Endpoint',
        };
      }
    }
  }

  // 2. Optional Google Cloud Vision API (when user configures EXPO_PUBLIC_GOOGLE_VISION_API_KEY)
  const gcvKey = process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY;
  if (gcvKey && options?.base64) {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(gcvKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: options.base64 },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            },
          ],
        }),
      }
    );
    if (res.ok) {
      const json = await res.json();
      const text = String(json?.responses?.[0]?.fullTextAnnotation?.text ?? '').trim();
      if (text.length > 0) {
        return {
          rawText: text,
          parsed: parseReceiptText(text, catalog),
          engine: 'google_cloud_vision',
          engineLabel: 'Google Cloud Vision',
        };
      }
    }
  }

  // 3. True On-Device Native OCR (Apple Vision on iOS, Google ML Kit on Android)
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    const TextExtractor = await import('expo-text-extractor');
    if (!TextExtractor.isSupported) {
      throw new Error('On-device OCR is not supported on this device.');
    }

    const nativeUri = normalizeNativeOcrUri(imageUri);
    const blocks = await TextExtractor.extractTextFromImage(nativeUri);
    const reconstructed = reconstructOcrLines(blocks);

    if (!reconstructed.trim()) {
      throw new Error(
        'No readable text detected on this image. Try taking a clearer, well-lit photo of the receipt.'
      );
    }

    return {
      rawText: reconstructed,
      parsed: parseReceiptText(reconstructed, catalog),
      engine: Platform.OS === 'ios' ? 'apple_vision' : 'google_mlkit',
      engineLabel: Platform.OS === 'ios' ? 'Apple Vision (On-Device)' : 'Google ML Kit (On-Device)',
    };
  }

  // 4. Web OCR using Tesseract.js (runs directly in browser)
  const Tesseract = await import('tesseract.js');
  const result = await Tesseract.recognize(imageUri, 'eng');
  const text = (result?.data?.text ?? '').trim();
  if (!text) {
    throw new Error('Could not read text from image. Try a sharper receipt photo or paste text.');
  }

  return {
    rawText: text,
    parsed: parseReceiptText(text, catalog),
    engine: 'tesseract_web',
    engineLabel: 'Tesseract.js (In-Browser)',
  };
}

export function parseManualReceiptText(rawText: string, catalog: Product[]): ParsedReceipt {
  return parseReceiptText(rawText, catalog);
}

export function getActiveOcrEngineLabel(): string {
  if (process.env.EXPO_PUBLIC_OCR_ENDPOINT) return 'Custom Cloud OCR';
  if (process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY) return 'Google Cloud Vision';
  if (Platform.OS === 'ios') return 'Apple Vision (On-Device · Offline)';
  if (Platform.OS === 'android') return 'Google ML Kit (On-Device · Offline)';
  return 'Tesseract.js (Web OCR)';
}
