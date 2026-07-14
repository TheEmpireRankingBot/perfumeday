import { describe, expect, it } from 'vitest';
import { migrateLegacyStorage } from '../src/shared/migration';

describe('PerfumeDay v1 migration', () => {
  it('seeds the known wardrobe when the old app has no shelf', () => {
    const result = migrateLegacyStorage({});
    expect(result.state.collection).toHaveLength(11);
    expect(result.state.catalog).toHaveLength(11);
  });

  it('maps known bottles, preserves unknown bottles, and imports feedback', () => {
    const result = migrateLegacyStorage({
      sotd_perfumes: JSON.stringify([
        { id: 'old-lv', name: 'Imagination', house: 'Louis Vuitton', addedAt: 1_700_000_000_000 },
        { id: 'old-custom', name: 'Rain Library', house: 'Small House', accords: ['green', 'rain'] },
      ]),
      sotd_history: JSON.stringify([
        { hid: 'wear-1', id: 'old-lv', name: 'Imagination', date: '12 Jul', occasion: 'Work', rating: 'love' },
        { hid: 'wear-2', id: 'old-custom', name: 'Rain Library', date: '13 Jul', occasion: 'Casual', rating: 'strong' },
      ]),
      sotd_taste: 'Keep strong woods outside.',
    });
    expect(result.state.collection).toHaveLength(2);
    expect(result.state.catalog.some((profile) => profile.id === 'lv-imagination')).toBe(true);
    expect(result.state.catalog.some((profile) => profile.name === 'Rain Library' && profile.needsConfirmation)).toBe(true);
    expect(result.state.wearLogs[0].enjoyment).toBe(5);
    expect(result.state.wearLogs[1].strength).toBe('too-strong');
    expect(result.state.preferences.tasteNotes).toBe('Keep strong woods outside.');
  });

  it('never carries legacy secrets into the v2 state', () => {
    const serialized = JSON.stringify(migrateLegacyStorage({
      sotd_key: 'anthropic-secret-sentinel',
      sotd_proxysecret: 'proxy-secret-value',
      sotd_gh_token: 'github-token-value',
      sotd_gist_id: 'gist-id-value',
    }).state);
    expect(serialized).not.toContain('anthropic-secret-sentinel');
    expect(serialized).not.toContain('proxy-secret-value');
    expect(serialized).not.toContain('github-token-value');
    expect(serialized).not.toContain('gist-id-value');
  });
});
