export const OCCASIONS = ['Work', 'Casual', 'Date', 'Night out', 'Sport', 'Special'] as const;
export const VIBES = ['Balanced', 'Fresh', 'Confident', 'Calm', 'Statement'] as const;
export const SETTINGS = ['indoor', 'mixed', 'outdoor'] as const;
export const DAY_PARTS = ['morning', 'afternoon', 'evening', 'night'] as const;

export type Occasion = (typeof OCCASIONS)[number];
export type Vibe = (typeof VIBES)[number];
export type Setting = (typeof SETTINGS)[number];
export type DayPart = (typeof DAY_PARTS)[number];

export interface WeatherContext {
  temperatureC: number;
  apparentTemperatureC: number;
  humidity: number;
  rainProbability: number;
  weatherCode?: number;
  source: 'live' | 'cached' | 'fallback';
  observedAt: string;
}

export interface DailyContext {
  date: string;
  timezone: string;
  weekday: number;
  dayPart: DayPart;
  occasion: Occasion;
  vibe: Vibe;
  setting: Setting;
  weather: WeatherContext;
}

export interface FragranceProfile {
  id: string;
  house: string;
  name: string;
  edition: string;
  summary: string;
  accords: string[];
  sourceConfidence: 'curated' | 'provisional';
  needsConfirmation?: boolean;
  traits: {
    freshness: number;
    sweetness: number;
    intensity: number;
    projection: number;
    longevity: number;
    formality: number;
    indoorSafety: number;
  };
  climate: {
    idealMinC: number;
    idealMaxC: number;
    toleranceMinC: number;
    toleranceMaxC: number;
    humidityTolerance: number;
    rainAffinity: number;
  };
  occasionFit: Record<Occasion, number>;
  dayPartFit: Record<DayPart, number>;
  vibeFit: Record<Vibe, number>;
  sprays: {
    hot: string;
    mild: string;
    cool: string;
  };
}

export interface CollectionItem {
  id: string;
  profileId: string;
  active: boolean;
  addedAt: string;
  notes?: string;
  imageUrl?: string;
}

export interface ManualFragranceInput {
  name: string;
  house: string;
  edition: string;
  accords: string[];
}

export type Enjoyment = 1 | 2 | 3 | 4 | 5;
export type StrengthFeedback = 'too-faint' | 'right' | 'too-strong';
export type LongevityFeedback = 'short' | 'right' | 'long';

export interface WearLog {
  id: string;
  profileIds: string[];
  wornAt: string;
  context: DailyContext;
  enjoyment?: Enjoyment;
  strength?: StrengthFeedback;
  longevity?: LongevityFeedback;
  notes?: string;
}

export interface ScoreBreakdown {
  climate: number;
  occasion: number;
  taste: number;
  time: number;
  rotation: number;
  vibe: number;
  penalties: number;
  total: number;
}

export interface CandidateScore {
  profileId: string;
  score: ScoreBreakdown;
  reasons: string[];
  application: string;
}

export interface RecommendationResult {
  id: string;
  contextHash: string;
  date: string;
  engineVersion: string;
  winner: CandidateScore;
  alternatives: CandidateScore[];
  context: DailyContext;
}

export interface UserPreferences {
  timezone: string;
  defaultLatitude: number;
  defaultLongitude: number;
  tasteNotes: string;
  defaultSetting: Setting;
}

export interface AppState {
  catalog: FragranceProfile[];
  collection: CollectionItem[];
  wearLogs: WearLog[];
  preferences: UserPreferences;
  recommendation?: RecommendationResult;
}
