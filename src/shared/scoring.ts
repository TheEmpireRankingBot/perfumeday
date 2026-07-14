import { CATALOG_VERSION } from './catalog';
import type {
  CandidateScore,
  CollectionItem,
  DailyContext,
  DayPart,
  FragranceProfile,
  Occasion,
  RecommendationResult,
  WearLog,
} from './types';

export const ENGINE_VERSION = `2.0.0-${CATALOG_VERSION}`;

const clamp = (value: number, min = 0, max = 10) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 10) / 10;

function temperatureFit(profile: FragranceProfile, temperatureC: number): number {
  const range = profile.climate;
  if (temperatureC >= range.idealMinC && temperatureC <= range.idealMaxC) return 10;
  if (temperatureC < range.idealMinC) {
    const width = Math.max(1, range.idealMinC - range.toleranceMinC);
    return clamp(((temperatureC - range.toleranceMinC) / width) * 10);
  }
  const width = Math.max(1, range.toleranceMaxC - range.idealMaxC);
  return clamp(((range.toleranceMaxC - temperatureC) / width) * 10);
}

function humidityFit(profile: FragranceProfile, humidity: number): number {
  const humidLoad = clamp((humidity - 55) / 4.5, 0, 10) / 10;
  return clamp(10 - humidLoad * (10 - profile.climate.humidityTolerance));
}

function rainFit(profile: FragranceProfile, probability: number): number {
  const rainLoad = clamp(probability / 10, 0, 10) / 10;
  return clamp(10 - rainLoad * (10 - profile.climate.rainAffinity));
}

function settingFit(profile: FragranceProfile, context: DailyContext): number {
  const outdoor = clamp((profile.traits.freshness + profile.traits.intensity + profile.traits.projection) / 3);
  if (context.setting === 'indoor') return profile.traits.indoorSafety;
  if (context.setting === 'outdoor') return outdoor;
  return (profile.traits.indoorSafety + outdoor) / 2;
}

function climateScore(profile: FragranceProfile, context: DailyContext): number {
  const apparent = context.weather.apparentTemperatureC;
  const raw = temperatureFit(profile, apparent) * 0.45
    + humidityFit(profile, context.weather.humidity) * 0.25
    + rainFit(profile, context.weather.rainProbability) * 0.15
    + settingFit(profile, context) * 0.15;
  return round((raw / 10) * 25);
}

function explicitTasteAdjustment(profile: FragranceProfile, tasteNotes: string): number {
  const notes = tasteNotes.toLowerCase();
  if (!notes.trim()) return 0;
  let adjustment = 0;
  for (const accord of profile.accords) {
    const escaped = accord.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?:love|like|prefer|enjoy)[^.!?]{0,30}${escaped}`).test(notes)) adjustment += 1.5;
    if (new RegExp(`(?:avoid|hate|dislike|no|nothing)[^.!?]{0,30}${escaped}`).test(notes)) adjustment -= 2;
  }
  if (/(?:avoid|nothing|not).{0,20}(?:heavy|strong|loud)/.test(notes) && profile.traits.intensity >= 7) adjustment -= 2;
  if (/(?:love|prefer|enjoy).{0,20}(?:strong|bold|projecting)/.test(notes) && profile.traits.projection >= 7) adjustment += 1.5;
  return clamp(adjustment, -4, 4);
}

function tasteScore(profile: FragranceProfile, logs: WearLog[], tasteNotes: string): number {
  const ratings = logs
    .filter((log) => log.profileIds.includes(profile.id) && log.enjoyment)
    .map((log) => log.enjoyment as number);
  const explicit = explicitTasteAdjustment(profile, tasteNotes);
  if (!ratings.length) return round(clamp(10 + explicit, 0, 20));
  const mean = ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
  const confidence = ratings.length / (ratings.length + 3);
  return round(clamp(10 + explicit + ((mean - 3) / 2) * 10 * confidence, 0, 20));
}

function rotationScore(profile: FragranceProfile, logs: WearLog[], now: Date): number {
  const latest = logs
    .filter((log) => log.profileIds.includes(profile.id))
    .map((log) => new Date(log.wornAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  if (!latest) return 10;
  const days = Math.max(0, (now.getTime() - latest) / 86_400_000);
  if (days < 1) return 0;
  if (days < 2) return 3;
  if (days < 4) return 6;
  if (days < 7) return 8;
  return 10;
}

function contextPenalties(profile: FragranceProfile, context: DailyContext, logs: WearLog[]): number {
  let penalties = 0;
  if (context.setting === 'indoor' && context.weather.apparentTemperatureC >= 30 && profile.traits.projection >= 8) {
    penalties -= 4;
  }
  const similar = logs.filter((log) =>
    log.profileIds.includes(profile.id)
    && log.context.occasion === context.occasion
    && Math.abs(log.context.weather.apparentTemperatureC - context.weather.apparentTemperatureC) <= 4,
  );
  if (similar.some((log) => log.strength === 'too-strong')) penalties -= 6;
  if (similar.some((log) => log.enjoyment && log.enjoyment <= 2)) penalties -= 5;
  return penalties;
}

function applicationFor(profile: FragranceProfile, context: DailyContext): string {
  const temperature = context.weather.apparentTemperatureC;
  if (temperature >= 29) return profile.sprays.hot;
  if (temperature <= 20) return profile.sprays.cool;
  return profile.sprays.mild;
}

function reasonFor(profile: FragranceProfile, context: DailyContext, candidate: CandidateScore): string[] {
  const reasons: string[] = [];
  if (candidate.score.climate >= 20) {
    reasons.push(`Strong fit for ${Math.round(context.weather.apparentTemperatureC)}°C and ${Math.round(context.weather.humidity)}% humidity.`);
  }
  if (candidate.score.occasion >= 20) reasons.push(`One of your best ${context.occasion.toLowerCase()} options.`);
  if (candidate.score.taste > 11) reasons.push('Your previous wear feedback lifts this choice.');
  if (candidate.score.rotation >= 9) reasons.push('It keeps the wardrobe rotation fresh.');
  if (candidate.score.vibe >= 8) reasons.push(`Matches the ${context.vibe.toLowerCase()} mood.`);
  if (!reasons.length) reasons.push(profile.summary);
  return reasons.slice(0, 3);
}

export function scoreCandidate(
  profile: FragranceProfile,
  context: DailyContext,
  logs: WearLog[],
  now = new Date(),
  tasteNotes = '',
): CandidateScore {
  const score = {
    climate: climateScore(profile, context),
    occasion: round((profile.occasionFit[context.occasion] / 10) * 25),
    taste: tasteScore(profile, logs, tasteNotes),
    time: round(profile.dayPartFit[context.dayPart]),
    rotation: rotationScore(profile, logs, now),
    vibe: round(profile.vibeFit[context.vibe]),
    penalties: contextPenalties(profile, context, logs),
    total: 0,
  };
  score.total = round(clamp(
    score.climate + score.occasion + score.taste + score.time + score.rotation + score.vibe + score.penalties,
    0,
    100,
  ));
  const candidate: CandidateScore = {
    profileId: profile.id,
    score,
    reasons: [],
    application: applicationFor(profile, context),
  };
  candidate.reasons = reasonFor(profile, context, candidate);
  return candidate;
}

export function hashContext(context: DailyContext): string {
  const stable = JSON.stringify({
    date: context.date,
    timezone: context.timezone,
    dayPart: context.dayPart,
    occasion: context.occasion,
    vibe: context.vibe,
    setting: context.setting,
    temperatureC: Math.round(context.weather.temperatureC),
    apparentTemperatureC: Math.round(context.weather.apparentTemperatureC),
    humidity: Math.round(context.weather.humidity / 5) * 5,
    rainProbability: Math.round(context.weather.rainProbability / 10) * 10,
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < stable.length; index += 1) {
    hash ^= stable.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function buildRecommendation(
  catalog: FragranceProfile[],
  collection: CollectionItem[],
  context: DailyContext,
  logs: WearLog[],
  now = new Date(),
  tasteNotes = '',
): RecommendationResult {
  const activeIds = new Set(collection.filter((item) => item.active).map((item) => item.profileId));
  const candidates = catalog
    .filter((profile) => activeIds.has(profile.id))
    .map((profile) => scoreCandidate(profile, context, logs, now, tasteNotes))
    .sort((left, right) => right.score.total - left.score.total || left.profileId.localeCompare(right.profileId));
  if (!candidates.length) throw new Error('Your active wardrobe is empty.');
  const contextHash = hashContext(context);
  return {
    id: `rec-${context.date}-${contextHash}`,
    contextHash,
    date: context.date,
    engineVersion: ENGINE_VERSION,
    winner: candidates[0],
    alternatives: candidates.slice(1, 3),
    context,
  };
}

export function dayPartFromHour(hour: number): DayPart {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}

export function inferOccasion(date: Date): Occasion {
  const weekday = date.getDay();
  const hour = date.getHours();
  return weekday >= 1 && weekday <= 5 && hour >= 6 && hour < 18 ? 'Work' : 'Casual';
}
