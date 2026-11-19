# PantryPulse (iOS & Android)

**PantryPulse** is a cross-platform **iOS & Android** predictive grocery inventory, automatic calorie/macro tracking, and smart shopping-trip scheduling app built with **React Native (Expo SDK 58 + Expo Router + TypeScript)** and an **offline-first SQLite + on-device ML** architecture.

## Core Capabilities

- **Inventory & Intake Tracking**
  - **Barcode Scanning** (`expo-camera` EAN-13/UPC-A) backed by local cache + live **Open Food Facts API v2** lookup (`src/services/barcodeService.ts`).
  - **Real On-Device Receipt OCR** (`expo-text-extractor` + `src/services/ocrService.ts` + `src/ml/receiptParser.ts`):
    - **iOS**: Native **Apple Vision** (`VNRecognizeTextRequest`) — works 100% offline with zero API keys.
    - **Android**: Native **Google ML Kit Text Recognition** (with `com.google.mlkit.vision.DEPENDENCIES=ocr` auto-download via `plugins/withMlKitOcr.js`) — works offline with zero API keys.
    - **Web**: In-browser **Tesseract.js** OCR fallback.
    - **Optional Cloud Override**: Set `EXPO_PUBLIC_GOOGLE_VISION_API_KEY` or `EXPO_PUBLIC_OCR_ENDPOINT` if you prefer cloud Vision OCR.
    - Handles real single-line, split-line, and two-column receipt OCR layouts, expands merchant POS abbreviations, normalizes units (`oz/lb/dz/fl oz` -> `g/ml/count`), and fuzzy-matches catalog nutrition.
  - **Closed-Loop Meal Logging** (`app/(tabs)/meals.tsx` + `src/ml/nutritionCalculator.ts`): automatic calorie, protein, carbs, fat, and fiber calculation with **FIFO (earliest-expiry-first) pantry deduction**.
- **Predictive ML Analytics (`src/ml/depletionForecaster.ts`)**
  - **Empirical Bayes Cold-Start Shrinkage** scaled by household size ($H^{0.85}$).
  - **Huber Outlier Dampening** so hosting spikes don't distort daily velocity.
  - **EWMA + 7-Day Seasonality Multipliers** with forward day-by-day simulation and **P10 / P50 / P90 depletion confidence bands**.
  - **Dual-Clock Spoilage Risk & Zero-Waste Meal Recommendations** (`src/ml/spoilageAndMeals.ts`).
- **Smart Scheduling (`src/ml/shoppingScheduler.ts` + `src/services/notificationService.ts`)**
  - Consolidates upcoming stockouts into an optimal shopping trip date aligned with preferred shopping weekdays.
  - Computes **shelf-life-capped** purchase quantities to avoid overbuying perishables.
  - Schedules local iOS & Android reminders via `expo-notifications`.
  - One-tap **Complete Trip → Restock Pantry** feedback loop.

## Building & Installing on Device

### Android (Installable `.apk`)
Compiled locally via Gradle (`./gradlew assembleRelease`) into `android/app/build/outputs/apk/release/app-release.apk` (or via EAS Build):
```bash
# Transfer app-release.apk to your Android phone and open to install, or via USB:
adb install android/app/build/outputs/apk/release/app-release.apk

# Or build via EAS cloud:
npx eas-cli build --platform android --profile preview
```

### iOS (Installable `.ipa`)
iOS `.ipa` binaries require macOS/Xcode code-signing (either via **EAS Build** cloud macOS builders or locally on a Mac with Xcode):
```bash
# Option 1: Cloud build & sign for direct iPhone installation (requires Expo + Apple Developer account)
npx eas-cli login
npx eas-cli build --platform ios --profile preview

# Option 2: Build locally on macOS using the generated Xcode project
cd ios && pod install
open PantryPulse.xcworkspace
```

## Development & Tests

```bash
npm install
npm run test       # Vitest ML, OCR parser, nutrition & scheduler unit tests
npm run typecheck  # Strict TypeScript check
npm start          # Launch Expo dev server
```
