import { describe, expect, it } from 'vitest';
import { createManualProfile, createStarterCollection, STARTER_CATALOG } from '../src/shared/catalog';
import { buildRecommendation, hashContext, scoreCandidate } from '../src/shared/scoring';
import type { DailyContext, WearLog } from '../src/shared/types';

const context = (patch: Partial<DailyContext> = {}): DailyContext => ({
  date: '2026-07-14',
  timezone: 'Asia/Singapore',
  weekday: 2,
  dayPart: 'morning',
  occasion: 'Work',
  vibe: 'Balanced',
  setting: 'mixed',
  weather: {
    temperatureC: 31,
    apparentTemperatureC: 35,
    humidity: 82,
    rainProbability: 45,
    weatherCode: 3,
    source: 'live',
    observedAt: '2026-07-14T00:00:00.000Z',
  },
  ...patch,
});

describe('starter catalog', () => {
  it('contains all 11 owned fragrances with complete scoring data', () => {
    expect(STARTER_CATALOG).toHaveLength(11);
    expect(new Set(STARTER_CATALOG.map((profile) => profile.id)).size).toBe(11);
    for (const profile of STARTER_CATALOG) {
      expect(profile.accords.length).toBeGreaterThanOrEqual(3);
      expect(profile.climate.idealMinC).toBeLessThan(profile.climate.idealMaxC);
      expect(Object.keys(profile.occasionFit)).toHaveLength(6);
      expect(Object.keys(profile.vibeFit)).toHaveLength(5);
    }
  });

  it('creates honest provisional profiles for manually added bottles', () => {
    const profile = createManualProfile({
      name: 'Test Scent', house: 'Test House', edition: '', accords: [' Citrus ', 'Woody'],
    }, 'custom-test');
    expect(profile.id).toBe('custom-test');
    expect(profile.accords).toEqual(['citrus', 'woody']);
    expect(profile.sourceConfidence).toBe('provisional');
    expect(profile.needsConfirmation).toBe(true);
  });
});

describe('deterministic recommendation scoring', () => {
  it('produces a stable winner and context hash for the same day', () => {
    const first = buildRecommendation(STARTER_CATALOG, createStarterCollection(), context(), []);
    const second = buildRecommendation(STARTER_CATALOG, createStarterCollection(), context(), []);
    expect(second.contextHash).toBe(first.contextHash);
    expect(second.winner.profileId).toBe(first.winner.profileId);
    expect(second.winner.score.total).toBe(first.winner.score.total);
  });

  it('changes the lock key when an override changes', () => {
    expect(hashContext(context())).not.toBe(hashContext(context({ occasion: 'Date' })));
    expect(hashContext(context())).not.toBe(hashContext(context({ setting: 'indoor' })));
    expect(hashContext(context())).not.toBe(hashContext(context({ vibe: 'Statement' })));
  });

  it('keeps every component and total inside its declared bounds', () => {
    for (const profile of STARTER_CATALOG) {
      const candidate = scoreCandidate(profile, context(), []);
      expect(candidate.score.climate).toBeGreaterThanOrEqual(0);
      expect(candidate.score.climate).toBeLessThanOrEqual(25);
      expect(candidate.score.occasion).toBeLessThanOrEqual(25);
      expect(candidate.score.taste).toBeLessThanOrEqual(20);
      expect(candidate.score.time).toBeLessThanOrEqual(10);
      expect(candidate.score.rotation).toBeLessThanOrEqual(10);
      expect(candidate.score.vibe).toBeLessThanOrEqual(10);
      expect(candidate.score.total).toBeGreaterThanOrEqual(0);
      expect(candidate.score.total).toBeLessThanOrEqual(100);
    }
  });

  it('penalizes a same-day repeat to protect wardrobe rotation', () => {
    const profile = STARTER_CATALOG[0];
    const baseline = scoreCandidate(profile, context(), [], new Date('2026-07-14T08:00:00+08:00'));
    const recent: WearLog = {
      id: 'recent', profileIds: [profile.id], wornAt: '2026-07-14T07:00:00+08:00', context: context(),
    };
    const repeated = scoreCandidate(profile, context(), [recent], new Date('2026-07-14T08:00:00+08:00'));
    expect(baseline.score.rotation).toBe(10);
    expect(repeated.score.rotation).toBe(0);
    expect(repeated.score.total).toBeLessThan(baseline.score.total);
  });

  it('learns gradually instead of overreacting to one rating', () => {
    const profile = STARTER_CATALOG[0];
    const oneLove: WearLog[] = [{
      id: 'one', profileIds: [profile.id], wornAt: '2026-07-01T08:00:00+08:00', context: context(), enjoyment: 5,
    }];
    const manyLoves: WearLog[] = Array.from({ length: 12 }, (_, index) => ({
      id: `love-${index}`, profileIds: [profile.id], wornAt: `2026-06-${String(index + 1).padStart(2, '0')}T08:00:00+08:00`,
      context: context(), enjoyment: 5 as const,
    }));
    const first = scoreCandidate(profile, context(), oneLove);
    const learned = scoreCandidate(profile, context(), manyLoves);
    expect(first.score.taste).toBeGreaterThan(10);
    expect(first.score.taste).toBeLessThan(15);
    expect(learned.score.taste).toBeGreaterThan(first.score.taste);
    expect(learned.score.taste).toBeLessThanOrEqual(20);
  });

  it('turns explicit taste notes into a bounded accord preference', () => {
    const imagination = STARTER_CATALOG.find((profile) => profile.id === 'lv-imagination')!;
    const neutral = scoreCandidate(imagination, context(), []);
    const preferred = scoreCandidate(imagination, context(), [], new Date(), 'I love citrus and tea in humid weather.');
    const avoided = scoreCandidate(imagination, context(), [], new Date(), 'I avoid citrus at work.');
    expect(preferred.score.taste).toBeGreaterThan(neutral.score.taste);
    expect(avoided.score.taste).toBeLessThan(neutral.score.taste);
    expect(preferred.score.taste).toBeLessThanOrEqual(14);
    expect(avoided.score.taste).toBeGreaterThanOrEqual(6);
  });

  it('applies a hot indoor projection penalty to forceful scents', () => {
    const santal = STARTER_CATALOG.find((profile) => profile.id === 'le-labo-santal-33')!;
    const candidate = scoreCandidate(santal, context({ setting: 'indoor' }), []);
    expect(candidate.score.penalties).toBe(-4);
  });

  it('rejects an empty active wardrobe', () => {
    expect(() => buildRecommendation(STARTER_CATALOG, [], context(), [])).toThrow('active wardrobe is empty');
  });
});
