export interface ThemePalette {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  border: string;
  borderSubtle: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primarySoft: string;
  primaryText: string;
  accent: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  tabBar: string;
}

export const LightPalette: ThemePalette = {
  background: '#F7F6F2',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#EFECE5',
  border: '#E4E0D6',
  borderSubtle: '#EFECE4',
  text: '#171C18',
  textSecondary: '#4E5850',
  textMuted: '#7E877F',
  primary: '#1B4332',
  primarySoft: '#E6F1EC',
  primaryText: '#FFFFFF',
  accent: '#40916C',
  accentSoft: '#EBF6F0',
  success: '#2D6A4F',
  successSoft: '#E5F4EC',
  warning: '#C86D1F',
  warningSoft: '#FDF1E5',
  danger: '#BA2D2D',
  dangerSoft: '#FCEAEA',
  protein: '#2B6CB0',
  carbs: '#D97706',
  fat: '#B83280',
  fiber: '#2F855A',
  tabBar: '#FFFFFF',
};

export const DarkPalette: ThemePalette = {
  background: '#111512',
  surface: '#1A201C',
  surfaceElevated: '#212924',
  surfaceMuted: '#232B26',
  border: '#2D3731',
  borderSubtle: '#222A25',
  text: '#F2F4F0',
  textSecondary: '#B7C0B8',
  textMuted: '#838F85',
  primary: '#52B788',
  primarySoft: '#193326',
  primaryText: '#0E1A14',
  accent: '#74C69D',
  accentSoft: '#192F24',
  success: '#52B788',
  successSoft: '#172E22',
  warning: '#F4A261',
  warningSoft: '#352618',
  danger: '#E76F6F',
  dangerSoft: '#3A1D1D',
  protein: '#63B3ED',
  carbs: '#F6AD55',
  fat: '#ED64A6',
  fiber: '#68D391',
  tabBar: '#161B18',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
} as const;

export const Radii = {
  sm: 8,
  md: 14,
  lg: 20,
  full: 999,
} as const;
