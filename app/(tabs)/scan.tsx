import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/src/components/Badge';
import { CATEGORY_PRIORS } from '@/src/domain/catalog';
import {
  BaseUnit,
  FoodCategory,
  ParsedReceipt,
  Product,
  StorageLocation,
} from '@/src/domain/types';
import { addDays } from '@/src/ml/depletionForecaster';
import { formatQuantity } from '@/src/ml/nutritionCalculator';
import { DEMO_BARCODES, lookupBarcode } from '@/src/services/barcodeService';
import {
  extractReceiptFromImage,
  getActiveOcrEngineLabel,
  parseManualReceiptText,
  SAMPLE_RECEIPTS,
} from '@/src/services/ocrService';
import { usePantry } from '@/src/store/PantryContext';
import { Radii, Spacing } from '@/src/theme/tokens';
import { useTheme } from '@/src/theme/useTheme';

type ScanTab = 'barcode' | 'receipt' | 'manual';

export default function ScanScreen() {
  const { palette } = useTheme();
  const { products, addInventoryBatch, importParsedReceipt } = usePantry();

  const [mode, setMode] = useState<ScanTab>('barcode');
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraActive, setCameraActive] = useState(false);

  // Barcode state
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeBusy, setBarcodeBusy] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [scanSource, setScanSource] = useState<string | null>(null);
  const [scanQty, setScanQty] = useState('');
  const [scanShelfDays, setScanShelfDays] = useState('');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Receipt OCR state
  const [receiptText, setReceiptText] = useState(SAMPLE_RECEIPTS[0].rawText);
  const [parsedReceipt, setParsedReceipt] = useState<ParsedReceipt | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrEngineUsed, setOcrEngineUsed] = useState<string>(getActiveOcrEngineLabel());

  // Manual quick add state
  const [manualName, setManualName] = useState('');
  const [manualCategory, setManualCategory] = useState<FoodCategory>('produce');
  const [manualQty, setManualQty] = useState('500');
  const [manualUnit, setManualUnit] = useState<BaseUnit>('g');
  const [manualKcal, setManualKcal] = useState('120');
  const [manualShelfDays, setManualShelfDays] = useState('7');
  const [manualStorage, setManualStorage] = useState<StorageLocation>('fridge');

  const showBanner = (msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => setStatusBanner(null), 4000);
  };

  const handleBarcodeLookup = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setBarcodeBusy(true);
    setCameraActive(false);
    const res = await lookupBarcode(trimmed, products);
    setBarcodeBusy(false);

    if (res.found && res.product) {
      setScannedProduct(res.product);
      setScanSource(
        res.source === 'open_food_facts' ? 'Open Food Facts API' : 'Local Nutrition Catalog'
      );
      setScanQty(String(res.product.defaultPackageQty));
      setScanShelfDays(String(res.product.defaultShelfLifeDays));
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } else {
      setScannedProduct(null);
      showBanner(`No product found for barcode ${trimmed}. Try Manual Add.`);
    }
  };

  const handleSaveScannedProduct = async () => {
    if (!scannedProduct) return;
    const qty = Math.max(1, parseFloat(scanQty) || scannedProduct.defaultPackageQty);
    const shelfDays = Math.max(1, parseInt(scanShelfDays, 10) || scannedProduct.defaultShelfLifeDays);
    await addInventoryBatch({
      product: scannedProduct,
      quantity: qty,
      expiresAt: addDays(new Date(), shelfDays).toISOString(),
    });
    showBanner(`Added ${scannedProduct.name} (${formatQuantity(qty, scannedProduct.defaultUnit)}) to Pantry`);
    setScannedProduct(null);
    setBarcodeInput('');
  };

  const processReceiptAsset = async (uri: string, base64?: string | null) => {
    setOcrBusy(true);
    try {
      const ocr = await extractReceiptFromImage(uri, products, { base64 });
      setReceiptText(ocr.rawText);
      setParsedReceipt(ocr.parsed);
      setOcrEngineUsed(ocr.engineLabel);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      showBanner(
        ocr.parsed.lines.length > 0
          ? `${ocr.engineLabel}: Extracted ${ocr.parsed.lines.length} line items!`
          : `${ocr.engineLabel} read the text, but found 0 priced items — edit text below to parse.`
      );
    } catch (err: any) {
      showBanner(err?.message || 'OCR failed on this image. Try retaking with clearer lighting.');
    } finally {
      setOcrBusy(false);
    }
  };

  const handleCaptureReceiptPhoto = async () => {
    if (Platform.OS === 'web') {
      return handlePickReceiptPhoto();
    }
    const camPerm = await ImagePicker.requestCameraPermissionsAsync();
    if (!camPerm.granted) {
      showBanner('Camera permission is required to photograph receipts.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      base64: Boolean(process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY),
    });
    if (!result.canceled && result.assets[0]?.uri) {
      await processReceiptAsset(result.assets[0].uri, result.assets[0].base64);
    }
  };

  const handlePickReceiptPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      base64: Boolean(process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY),
    });
    if (!result.canceled && result.assets[0]?.uri) {
      await processReceiptAsset(result.assets[0].uri, result.assets[0].base64);
    }
  };

  const handleParseReceiptText = (textOverride?: string) => {
    const src = textOverride ?? receiptText;
    const parsed = parseManualReceiptText(src, products);
    setParsedReceipt(parsed);
  };

  const toggleReceiptLine = (lineId: string) => {
    if (!parsedReceipt) return;
    setParsedReceipt({
      ...parsedReceipt,
      lines: parsedReceipt.lines.map((l) =>
        l.id === lineId ? { ...l, selected: !l.selected } : l
      ),
    });
  };

  const handleImportReceipt = async () => {
    if (!parsedReceipt) return;
    const count = await importParsedReceipt(parsedReceipt, receiptText);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    showBanner(`Imported ${count} items from ${parsedReceipt.merchantName} into Pantry!`);
    setParsedReceipt(null);
  };

  const handleManualAdd = async () => {
    if (!manualName.trim()) {
      showBanner('Please enter an item name.');
      return;
    }
    const prior = CATEGORY_PRIORS[manualCategory];
    const qty = Math.max(1, parseFloat(manualQty) || 1);
    const shelfDays = Math.max(1, parseInt(manualShelfDays, 10) || prior.defaultShelfLifeDays);
    const kcal = Math.max(0, parseFloat(manualKcal) || prior.defaultKcalPer100);

    const newProduct: Product = {
      id: `prod_custom_${Date.now()}`,
      barcode: null,
      name: manualName.trim(),
      brand: 'Custom Entry',
      category: manualCategory,
      defaultUnit: manualUnit,
      defaultPackageQty: qty,
      servingSize: manualUnit === 'count' ? 1 : Math.round(qty / 4),
      servingLabel: manualUnit === 'count' ? '1 unit' : `1 serving`,
      kcalPer100: kcal,
      proteinPer100: 8,
      carbsPer100: 15,
      fatPer100: 4,
      fiberPer100: 2,
      defaultShelfLifeDays: shelfDays,
      storageLocation: manualStorage,
      avgUnitPrice: 4.99,
      aisle: prior.defaultAisle,
      isStaple: false,
      updatedAt: new Date().toISOString(),
    };

    await addInventoryBatch({
      product: newProduct,
      quantity: qty,
      storageLocation: manualStorage,
      expiresAt: addDays(new Date(), shelfDays).toISOString(),
    });
    showBanner(`Added ${newProduct.name} to your ${manualStorage}.`);
    setManualName('');
  };

  const openNativeCamera = async () => {
    if (Platform.OS === 'web') {
      showBanner('Live camera barcode scanning runs on iOS/Android. Use demo barcodes below on Web.');
      return;
    }
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        showBanner('Camera permission is needed to scan barcodes.');
        return;
      }
    }
    setCameraActive(true);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={[styles.title, { color: palette.text }]}>Scan & Restock</Text>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
            Ingest groceries via barcode, receipt OCR, or manual entry
          </Text>
        </View>

        {statusBanner && (
          <View style={[styles.toast, { backgroundColor: palette.primarySoft, borderColor: palette.primary }]}>
            <Ionicons name="checkmark-circle" size={18} color={palette.primary} />
            <Text style={[styles.toastText, { color: palette.primary }]}>{statusBanner}</Text>
          </View>
        )}

        {/* Mode Switcher */}
        <View style={[styles.segmentBar, { backgroundColor: palette.surfaceMuted }]}>
          {(
            [
              { key: 'barcode', label: 'Barcode', icon: 'barcode-outline' },
              { key: 'receipt', label: 'Receipt OCR', icon: 'receipt-outline' },
              { key: 'manual', label: 'Quick Add', icon: 'create-outline' },
            ] as const
          ).map((tab) => {
            const active = mode === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setMode(tab.key)}
                style={[
                  styles.segmentBtn,
                  active && { backgroundColor: palette.surface },
                ]}>
                <Ionicons
                  name={tab.icon}
                  size={15}
                  color={active ? palette.primary : palette.textMuted}
                />
                <Text
                  style={[
                    styles.segmentLabel,
                    { color: active ? palette.text : palette.textMuted },
                  ]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* MODE 1: BARCODE SCANNER */}
        {mode === 'barcode' && (
          <View style={{ gap: 14 }}>
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              {cameraActive && Platform.OS !== 'web' ? (
                <View style={styles.cameraBox}>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    barcodeScannerSettings={{
                      barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
                    }}
                    onBarcodeScanned={({ data }) => {
                      if (!barcodeBusy && data) {
                        setBarcodeInput(data);
                        handleBarcodeLookup(data);
                      }
                    }}
                  />
                  <View style={styles.reticle} />
                  <Pressable
                    onPress={() => setCameraActive(false)}
                    style={styles.closeCamBtn}>
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>
                      Close Camera
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={openNativeCamera}
                  style={[styles.cameraPrompt, { backgroundColor: palette.primarySoft }]}>
                  <Ionicons name="camera" size={30} color={palette.primary} />
                  <Text style={[styles.cameraPromptTitle, { color: palette.primary }]}>
                    Open Native Barcode Camera
                  </Text>
                  <Text style={[styles.cameraPromptSub, { color: palette.textSecondary }]}>
                    Supports EAN-13, UPC-A + Open Food Facts nutrition lookup
                  </Text>
                </Pressable>
              )}

              <View style={styles.inputRow}>
                <TextInput
                  value={barcodeInput}
                  onChangeText={setBarcodeInput}
                  placeholder="Enter UPC / EAN barcode..."
                  placeholderTextColor={palette.textMuted}
                  keyboardType="numeric"
                  style={[
                    styles.input,
                    { backgroundColor: palette.background, borderColor: palette.border, color: palette.text, flex: 1 },
                  ]}
                />
                <Pressable
                  onPress={() => handleBarcodeLookup(barcodeInput)}
                  style={[styles.primaryBtn, { backgroundColor: palette.primary }]}>
                  {barcodeBusy ? (
                    <ActivityIndicator size="small" color={palette.primaryText} />
                  ) : (
                    <Text style={[styles.primaryBtnText, { color: palette.primaryText }]}>Lookup</Text>
                  )}
                </Pressable>
              </View>

              <Text style={[styles.miniLabel, { color: palette.textMuted }]}>
                Instant Test Barcodes (Offline + Nutrition Catalog):
              </Text>
              <View style={styles.demoWrap}>
                {DEMO_BARCODES.map((b) => (
                  <Pressable
                    key={b.barcode}
                    onPress={() => {
                      setBarcodeInput(b.barcode);
                      handleBarcodeLookup(b.barcode);
                    }}
                    style={[styles.demoChip, { backgroundColor: palette.surfaceMuted }]}>
                    <Text style={[styles.demoChipText, { color: palette.text }]}>{b.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Scanned Product Confirmation Card */}
            {scannedProduct && (
              <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.primary }]}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.prodTitle, { color: palette.text }]}>
                      {scannedProduct.name}
                    </Text>
                    <Text style={[styles.prodSub, { color: palette.textSecondary }]}>
                      {scannedProduct.brand ?? scannedProduct.category} ·{' '}
                      {scannedProduct.kcalPer100} kcal /{' '}
                      {scannedProduct.defaultUnit === 'count' ? '1 ct' : `100 ${scannedProduct.defaultUnit}`}
                    </Text>
                  </View>
                  {scanSource && <Badge label={scanSource} tone="primary" />}
                </View>

                <View style={styles.fieldRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>
                      Quantity ({scannedProduct.defaultUnit})
                    </Text>
                    <TextInput
                      value={scanQty}
                      onChangeText={setScanQty}
                      keyboardType="numeric"
                      style={[
                        styles.input,
                        { backgroundColor: palette.background, borderColor: palette.border, color: palette.text },
                      ]}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>
                      Expires In (days)
                    </Text>
                    <TextInput
                      value={scanShelfDays}
                      onChangeText={setScanShelfDays}
                      keyboardType="numeric"
                      style={[
                        styles.input,
                        { backgroundColor: palette.background, borderColor: palette.border, color: palette.text },
                      ]}
                    />
                  </View>
                </View>

                <Pressable
                  onPress={handleSaveScannedProduct}
                  style={[styles.fullBtn, { backgroundColor: palette.primary }]}>
                  <Ionicons name="checkmark-circle-outline" size={18} color={palette.primaryText} />
                  <Text style={[styles.primaryBtnText, { color: palette.primaryText }]}>
                    Add Batch to Pantry
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* MODE 2: RECEIPT OCR PARSER */}
        {mode === 'receipt' && (
          <View style={{ gap: 14 }}>
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: palette.text }]}>Receipt OCR Scanner</Text>
                  <Text style={[styles.prodSub, { color: palette.textSecondary }]}>
                    Engine: {ocrEngineUsed}
                  </Text>
                </View>
                <Badge label={ocrBusy ? 'Scanning...' : 'On-Device'} tone="success" />
              </View>

              <View style={styles.fieldRow}>
                <Pressable
                  onPress={handleCaptureReceiptPhoto}
                  disabled={ocrBusy}
                  style={[
                    styles.fullBtn,
                    { flex: 1, backgroundColor: palette.primary, opacity: ocrBusy ? 0.6 : 1 },
                  ]}>
                  {ocrBusy ? (
                    <ActivityIndicator size="small" color={palette.primaryText} />
                  ) : (
                    <Ionicons name="camera-outline" size={17} color={palette.primaryText} />
                  )}
                  <Text style={[styles.primaryBtnText, { color: palette.primaryText }]}>
                    Take Photo
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handlePickReceiptPhoto}
                  disabled={ocrBusy}
                  style={[
                    styles.fullBtn,
                    { flex: 1, backgroundColor: palette.primarySoft, opacity: ocrBusy ? 0.6 : 1 },
                  ]}>
                  <Ionicons name="image-outline" size={17} color={palette.primary} />
                  <Text style={[styles.primaryBtnText, { color: palette.primary }]}>
                    Photo Library
                  </Text>
                </Pressable>
              </View>

              <Text style={[styles.miniLabel, { color: palette.textMuted }]}>
                Or test parser with sample receipts:
              </Text>
              <View style={styles.demoWrap}>
                {SAMPLE_RECEIPTS.map((preset) => (
                  <Pressable
                    key={preset.id}
                    onPress={() => {
                      setReceiptText(preset.rawText);
                      handleParseReceiptText(preset.rawText);
                    }}
                    style={[styles.demoChip, { backgroundColor: palette.surfaceMuted }]}>
                    <Text style={[styles.demoChipText, { color: palette.text }]}>
                      Sample: {preset.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <TextInput
                value={receiptText}
                onChangeText={setReceiptText}
                multiline
                numberOfLines={7}
                textAlignVertical="top"
                placeholder="Paste raw receipt OCR text..."
                placeholderTextColor={palette.textMuted}
                style={[
                  styles.receiptInput,
                  { backgroundColor: palette.background, borderColor: palette.border, color: palette.text },
                ]}
              />

              <Pressable
                onPress={() => handleParseReceiptText()}
                style={[styles.fullBtn, { backgroundColor: palette.primary }]}>
                <Ionicons name="sparkles" size={16} color={palette.primaryText} />
                <Text style={[styles.primaryBtnText, { color: palette.primaryText }]}>
                  Parse & Match Receipt Items
                </Text>
              </Pressable>
            </View>

            {/* Parsed Receipt Review */}
            {parsedReceipt && (
              <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.primary }]}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: palette.text }]}>
                      {parsedReceipt.merchantName}
                    </Text>
                    <Text style={[styles.prodSub, { color: palette.textSecondary }]}>
                      {parsedReceipt.lines.filter((l) => l.selected).length} of{' '}
                      {parsedReceipt.lines.length} items selected · Total $
                      {parsedReceipt.total.toFixed(2)}
                    </Text>
                  </View>
                  <Badge label="Review" tone="primary" />
                </View>

                <View style={{ gap: 8 }}>
                  {parsedReceipt.lines.map((line) => (
                    <Pressable
                      key={line.id}
                      onPress={() => toggleReceiptLine(line.id)}
                      style={[
                        styles.parsedRow,
                        {
                          backgroundColor: line.selected ? palette.background : palette.surfaceMuted,
                          borderColor: palette.borderSubtle,
                          opacity: line.selected ? 1 : 0.55,
                        },
                      ]}>
                      <Ionicons
                        name={line.selected ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={line.selected ? palette.primary : palette.textMuted}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.parsedName, { color: palette.text }]}>
                          {line.normalizedName}
                        </Text>
                        <Text style={[styles.parsedSub, { color: palette.textSecondary }]}>
                          {formatQuantity(line.quantity, line.unit)} · {line.storageLocation} ·{' '}
                          {line.estimatedShelfLifeDays}d shelf life ·{' '}
                          {line.matchedProductId
                            ? `Catalog match (${Math.round(line.matchConfidence * 100)}%)`
                            : 'New item'}
                        </Text>
                      </View>
                      <Text style={[styles.priceText, { color: palette.text }]}>
                        ${line.price.toFixed(2)}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable
                  onPress={handleImportReceipt}
                  style={[styles.fullBtn, { backgroundColor: palette.primary }]}>
                  <Ionicons name="download-outline" size={17} color={palette.primaryText} />
                  <Text style={[styles.primaryBtnText, { color: palette.primaryText }]}>
                    Import {parsedReceipt.lines.filter((l) => l.selected).length} Items to Pantry
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* MODE 3: QUICK MANUAL ADD */}
        {mode === 'manual' && (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.cardTitle, { color: palette.text }]}>Add Custom Grocery Item</Text>

            <View style={{ gap: 4 }}>
              <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>Item Name</Text>
              <TextInput
                value={manualName}
                onChangeText={setManualName}
                placeholder="e.g., Organic Strawberries"
                placeholderTextColor={palette.textMuted}
                style={[
                  styles.input,
                  { backgroundColor: palette.background, borderColor: palette.border, color: palette.text },
                ]}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>Category</Text>
              <View style={styles.demoWrap}>
                {(['produce', 'dairy', 'protein', 'grains', 'bakery', 'beverages', 'pantry'] as FoodCategory[]).map(
                  (c) => (
                    <Pressable
                      key={c}
                      onPress={() => {
                        setManualCategory(c);
                        setManualStorage(CATEGORY_PRIORS[c].defaultStorage);
                        setManualShelfDays(String(CATEGORY_PRIORS[c].defaultShelfLifeDays));
                        setManualKcal(String(CATEGORY_PRIORS[c].defaultKcalPer100));
                      }}
                      style={[
                        styles.demoChip,
                        {
                          backgroundColor: manualCategory === c ? palette.primary : palette.surfaceMuted,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.demoChipText,
                          { color: manualCategory === c ? palette.primaryText : palette.text },
                        ]}>
                        {c}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>
            </View>

            <View style={styles.fieldRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>Quantity</Text>
                <TextInput
                  value={manualQty}
                  onChangeText={setManualQty}
                  keyboardType="numeric"
                  style={[
                    styles.input,
                    { backgroundColor: palette.background, borderColor: palette.border, color: palette.text },
                  ]}
                />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>Unit</Text>
                <View style={styles.unitRow}>
                  {(['g', 'ml', 'count'] as BaseUnit[]).map((u) => (
                    <Pressable
                      key={u}
                      onPress={() => setManualUnit(u)}
                      style={[
                        styles.unitBtn,
                        {
                          backgroundColor: manualUnit === u ? palette.primary : palette.surfaceMuted,
                        },
                      ]}>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: manualUnit === u ? palette.primaryText : palette.text,
                        }}>
                        {u}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.fieldRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>
                  Kcal / {manualUnit === 'count' ? '1 ct' : `100 ${manualUnit}`}
                </Text>
                <TextInput
                  value={manualKcal}
                  onChangeText={setManualKcal}
                  keyboardType="numeric"
                  style={[
                    styles.input,
                    { backgroundColor: palette.background, borderColor: palette.border, color: palette.text },
                  ]}
                />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>
                  Shelf Life (days)
                </Text>
                <TextInput
                  value={manualShelfDays}
                  onChangeText={setManualShelfDays}
                  keyboardType="numeric"
                  style={[
                    styles.input,
                    { backgroundColor: palette.background, borderColor: palette.border, color: palette.text },
                  ]}
                />
              </View>
            </View>

            <Pressable
              onPress={handleManualAdd}
              style={[styles.fullBtn, { backgroundColor: palette.primary }]}>
              <Ionicons name="add-circle-outline" size={18} color={palette.primaryText} />
              <Text style={[styles.primaryBtnText, { color: palette.primaryText }]}>
                Save to Pantry
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: 44,
    gap: 14,
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
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: Radii.md,
    borderWidth: 1,
  },
  toastText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  segmentBar: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radii.md,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: Radii.sm + 2,
  },
  segmentLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cameraPrompt: {
    borderRadius: Radii.md,
    paddingVertical: 26,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 6,
  },
  cameraPromptTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  cameraPromptSub: {
    fontSize: 12,
    textAlign: 'center',
  },
  cameraBox: {
    height: 220,
    borderRadius: Radii.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticle: {
    width: 210,
    height: 110,
    borderWidth: 2,
    borderColor: '#52B788',
    borderRadius: 12,
  },
  closeCamBtn: {
    position: 'absolute',
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 99,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radii.sm + 2,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 14,
  },
  receiptInput: {
    borderWidth: 1,
    borderRadius: Radii.sm + 2,
    padding: 10,
    minHeight: 136,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  primaryBtn: {
    paddingHorizontal: 16,
    height: 42,
    borderRadius: Radii.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: Radii.md,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radii.full,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  miniLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  demoWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  demoChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radii.full,
  },
  demoChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  prodTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  prodSub: {
    fontSize: 12,
    marginTop: 2,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  parsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: Radii.sm + 2,
    borderWidth: 1,
  },
  parsedName: {
    fontSize: 14,
    fontWeight: '600',
  },
  parsedSub: {
    fontSize: 11,
    marginTop: 2,
  },
  priceText: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  unitRow: {
    flexDirection: 'row',
    gap: 6,
    height: 42,
  },
  unitBtn: {
    flex: 1,
    borderRadius: Radii.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
