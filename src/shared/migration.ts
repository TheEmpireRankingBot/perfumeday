import { createStarterCollection, STARTER_CATALOG } from './catalog';
import type { AppState, DailyContext, FragranceProfile, WearLog } from './types';

interface LegacyPerfume {
  id?: string;
  name?: string;
  house?: string;
  accords?: string[];
  vibe?: string;
  bestFor?: string;
  imageUrl?: string;
  imageData?: string;
  addedAt?: number;
}

interface LegacyHistory {
  hid?: string;
  id?: string;
  combo?: string[];
  name?: string;
  date?: string;
  occasion?: string;
  rating?: string;
}

export interface LegacyMigrationResult {
  state: AppState;
  imported: { collection: number; wearLogs: number };
  warnings: string[];
}

const normalize = (value = '') => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (value: string) => normalize(value).replace(/\s+/g, '-').slice(0, 48) || 'unknown';

function neutralProfile(perfume: LegacyPerfume, index: number): FragranceProfile {
  const name = perfume.name?.trim() || `Imported fragrance ${index + 1}`;
  return {
    id: `imported-${slug(`${perfume.house || ''}-${name}`)}-${index + 1}`,
    house: perfume.house?.trim() || 'Unknown house',
    name,
    edition: 'Edition to confirm',
    summary: perfume.vibe || perfume.bestFor || 'Imported from PerfumeDay v1; profile details need confirmation.',
    accords: perfume.accords?.slice(0, 8) || [],
    sourceConfidence: 'provisional',
    needsConfirmation: true,
    traits: { freshness: 5, sweetness: 5, intensity: 5, projection: 5, longevity: 5, formality: 5, indoorSafety: 6 },
    climate: { idealMinC: 18, idealMaxC: 31, toleranceMinC: 10, toleranceMaxC: 36, humidityTolerance: 6, rainAffinity: 5 },
    occasionFit: { Work: 6, Casual: 7, Date: 6, 'Night out': 6, Sport: 4, Special: 6 },
    dayPartFit: { morning: 6, afternoon: 7, evening: 7, night: 6 },
    vibeFit: { Balanced: 7, Fresh: 5, Confident: 6, Calm: 5, Statement: 5 },
    sprays: { hot: '2 sprays — adjust after testing', mild: '3 sprays — adjust after testing', cool: '4 sprays — adjust after testing' },
  };
}

function matchCatalog(perfume: LegacyPerfume): FragranceProfile | undefined {
  const needle = normalize(`${perfume.house || ''} ${perfume.name || ''}`);
  return STARTER_CATALOG.find((profile) => {
    const full = normalize(`${profile.house} ${profile.name}`);
    const name = normalize(profile.name);
    return needle === full || needle.includes(name) || full.includes(normalize(perfume.name));
  });
}

function parseArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const fallbackContext = (history: LegacyHistory, wornAt: Date): DailyContext => ({
  date: wornAt.toISOString().slice(0, 10),
  timezone: 'Asia/Singapore',
  weekday: wornAt.getDay(),
  dayPart: 'morning',
  occasion: ['Work', 'Casual', 'Date', 'Night out', 'Sport', 'Special'].includes(history.occasion || '')
    ? history.occasion as DailyContext['occasion'] : 'Casual',
  vibe: 'Balanced',
  setting: 'mixed',
  weather: {
    temperatureC: 30,
    apparentTemperatureC: 33,
    humidity: 75,
    rainProbability: 40,
    source: 'fallback',
    observedAt: wornAt.toISOString(),
  },
});

function legacyDate(value?: string): Date {
  if (!value) return new Date();
  const currentYear = new Date().getFullYear();
  const parsed = new Date(`${value} ${currentYear}`);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

export function migrateLegacyStorage(storage: Record<string, string | null | undefined>): LegacyMigrationResult {
  const legacyPerfumes = parseArray<LegacyPerfume>(storage.sotd_perfumes);
  const legacyHistory = parseArray<LegacyHistory>(storage.sotd_history);
  const catalog = [...STARTER_CATALOG];
  const idMap = new Map<string, string>();
  const warnings: string[] = [];

  const collection = legacyPerfumes.length ? legacyPerfumes.map((perfume, index) => {
    let profile = matchCatalog(perfume);
    if (!profile) {
      profile = neutralProfile(perfume, index);
      catalog.push(profile);
      warnings.push(`${profile.name} was imported with a provisional profile.`);
    }
    if (perfume.id) idMap.set(perfume.id, profile.id);
    return {
      id: perfume.id || `imported-item-${index + 1}`,
      profileId: profile.id,
      active: true,
      addedAt: perfume.addedAt ? new Date(perfume.addedAt).toISOString() : new Date().toISOString(),
      imageUrl: perfume.imageData || perfume.imageUrl || undefined,
    };
  }) : createStarterCollection();

  const profileByName = (name = '') => catalog.find((profile) => normalize(name).includes(normalize(profile.name)));
  const wearLogs: WearLog[] = legacyHistory.map((history, index) => {
    const wornAt = legacyDate(history.date);
    const profileIds = (history.combo || [history.id || ''])
      .map((id) => idMap.get(id))
      .filter((id): id is string => Boolean(id));
    if (!profileIds.length) {
      const match = profileByName(history.name);
      if (match) profileIds.push(match.id);
    }
    const feedback = history.rating === 'love' ? { enjoyment: 5 as const }
      : history.rating === 'good' ? { enjoyment: 4 as const }
      : history.rating === 'strong' ? { enjoyment: 3 as const, strength: 'too-strong' as const }
      : history.rating === 'faint' ? { enjoyment: 3 as const, strength: 'too-faint' as const }
      : history.rating === 'wrong' ? { enjoyment: 2 as const }
      : {};
    return {
      id: history.hid || `legacy-wear-${index + 1}`,
      profileIds,
      wornAt: wornAt.toISOString(),
      context: fallbackContext(history, wornAt),
      ...feedback,
    };
  }).filter((log) => log.profileIds.length > 0);

  return {
    state: {
      catalog,
      collection,
      wearLogs,
      preferences: {
        timezone: 'Asia/Singapore',
        defaultLatitude: 1.3521,
        defaultLongitude: 103.8198,
        tasteNotes: storage.sotd_taste || '',
        defaultSetting: 'mixed',
      },
    },
    imported: { collection: collection.length, wearLogs: wearLogs.length },
    warnings,
  };
}

export const LEGACY_SECRET_KEYS = ['sotd_key', 'sotd_proxysecret', 'sotd_gh_token', 'sotd_gist_id'] as const;
