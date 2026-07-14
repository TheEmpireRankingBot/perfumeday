import { CATALOG_VERSION, createStarterCollection, STARTER_CATALOG } from '../shared/catalog';
import type {
  AppState,
  CollectionItem,
  FragranceProfile,
  RecommendationResult,
  UserPreferences,
  WearLog,
} from '../shared/types';

export interface Env {
  DB: D1Database;
  ANTHROPIC_API_KEY?: string;
  AI_MODEL?: string;
  DEFAULT_TIMEZONE: string;
  DEFAULT_LATITUDE: string;
  DEFAULT_LONGITUDE: string;
  REQUIRE_ACCESS?: string;
}

const nowIso = () => new Date().toISOString();
const userIdFor = (email: string) => `user-${email.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

export async function ensureUser(env: Env, email: string): Promise<string> {
  const id = userIdFor(email);
  const now = nowIso();
  await env.DB.prepare('INSERT OR IGNORE INTO users (id, email, created_at) VALUES (?, ?, ?)').bind(id, email, now).run();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO preferences
      (user_id, timezone, default_latitude, default_longitude, taste_notes, default_setting, updated_at)
    VALUES (?, ?, ?, ?, '', 'mixed', ?)
  `).bind(id, env.DEFAULT_TIMEZONE || 'Asia/Singapore', Number(env.DEFAULT_LATITUDE || 1.3521), Number(env.DEFAULT_LONGITUDE || 103.8198), now).run();
  return id;
}

export async function ensureStarterData(env: Env, userId: string): Promise<void> {
  const now = nowIso();
  await env.DB.batch(STARTER_CATALOG.map((profile) => env.DB.prepare(`
    INSERT INTO fragrances (id, profile_json, catalog_version, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET profile_json = excluded.profile_json, catalog_version = excluded.catalog_version, updated_at = excluded.updated_at
  `).bind(profile.id, JSON.stringify(profile), CATALOG_VERSION, now)));

  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM collection_items WHERE user_id = ?').bind(userId).first<{ count: number }>();
  if (Number(count?.count || 0) === 0) {
    await env.DB.batch(createStarterCollection().map((item) => env.DB.prepare(`
      INSERT OR IGNORE INTO collection_items (user_id, id, profile_id, active, added_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(userId, item.id, item.profileId, item.active ? 1 : 0, item.addedAt, now)));
  }
}

export async function loadState(env: Env, userId: string): Promise<AppState> {
  await ensureStarterData(env, userId);
  const [profiles, items, logs, preferences] = await Promise.all([
    env.DB.prepare('SELECT profile_json FROM fragrances ORDER BY id').all<{ profile_json: string }>(),
    env.DB.prepare('SELECT * FROM collection_items WHERE user_id = ? ORDER BY added_at').bind(userId).all<{
      id: string; profile_id: string; active: number; added_at: string; notes?: string; image_url?: string;
    }>(),
    env.DB.prepare('SELECT * FROM wear_logs WHERE user_id = ? ORDER BY worn_at DESC LIMIT 250').bind(userId).all<{
      id: string; profile_ids_json: string; worn_at: string; context_json: string; enjoyment?: number;
      strength?: WearLog['strength']; longevity?: WearLog['longevity']; notes?: string;
    }>(),
    env.DB.prepare('SELECT * FROM preferences WHERE user_id = ?').bind(userId).first<{
      timezone: string; default_latitude: number; default_longitude: number; taste_notes: string; default_setting: UserPreferences['defaultSetting'];
    }>(),
  ]);
  const catalog = profiles.results.map((row) => JSON.parse(row.profile_json) as FragranceProfile);
  const collection: CollectionItem[] = items.results.map((row) => ({
    id: row.id, profileId: row.profile_id, active: Boolean(row.active), addedAt: row.added_at,
    notes: row.notes || undefined, imageUrl: row.image_url || undefined,
  }));
  const wearLogs: WearLog[] = logs.results.map((row) => ({
    id: row.id,
    profileIds: JSON.parse(row.profile_ids_json),
    wornAt: row.worn_at,
    context: JSON.parse(row.context_json),
    enjoyment: row.enjoyment as WearLog['enjoyment'],
    strength: row.strength || undefined,
    longevity: row.longevity || undefined,
    notes: row.notes || undefined,
  }));
  return {
    catalog,
    collection,
    wearLogs,
    preferences: {
      timezone: preferences?.timezone || 'Asia/Singapore',
      defaultLatitude: Number(preferences?.default_latitude ?? 1.3521),
      defaultLongitude: Number(preferences?.default_longitude ?? 103.8198),
      tasteNotes: preferences?.taste_notes || '',
      defaultSetting: preferences?.default_setting || 'mixed',
    },
  };
}

export async function findRecommendation(
  env: Env,
  userId: string,
  date: string,
  contextHash: string,
  engineVersion: string,
): Promise<RecommendationResult | undefined> {
  const row = await env.DB.prepare(`
    SELECT result_json FROM recommendations
    WHERE user_id = ? AND recommendation_date = ? AND context_hash = ? AND engine_version = ?
  `).bind(userId, date, contextHash, engineVersion).first<{ result_json: string }>();
  return row ? JSON.parse(row.result_json) as RecommendationResult : undefined;
}

export async function saveRecommendation(env: Env, userId: string, result: RecommendationResult): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO recommendations (id, user_id, recommendation_date, context_hash, engine_version, result_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, recommendation_date, context_hash, engine_version)
    DO UPDATE SET result_json = excluded.result_json, created_at = excluded.created_at
  `).bind(result.id, userId, result.date, result.contextHash, result.engineVersion, JSON.stringify(result), nowIso()).run();
}

export async function createWear(env: Env, userId: string, log: WearLog): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO wear_logs (id, user_id, profile_ids_json, worn_at, context_json, enjoyment, strength, longevity, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    log.id, userId, JSON.stringify(log.profileIds), log.wornAt, JSON.stringify(log.context),
    log.enjoyment ?? null, log.strength ?? null, log.longevity ?? null, log.notes ?? null, nowIso(),
  ).run();
}

export async function updateWear(env: Env, userId: string, id: string, patch: Partial<WearLog>): Promise<WearLog | undefined> {
  await env.DB.prepare(`
    UPDATE wear_logs SET enjoyment = COALESCE(?, enjoyment), strength = COALESCE(?, strength),
      longevity = COALESCE(?, longevity), notes = COALESCE(?, notes), updated_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(patch.enjoyment ?? null, patch.strength ?? null, patch.longevity ?? null, patch.notes ?? null, nowIso(), id, userId).run();
  const state = await loadState(env, userId);
  return state.wearLogs.find((log) => log.id === id);
}

export async function setCollectionActive(env: Env, userId: string, profileId: string, active: boolean): Promise<void> {
  await env.DB.prepare('UPDATE collection_items SET active = ?, updated_at = ? WHERE user_id = ? AND profile_id = ?')
    .bind(active ? 1 : 0, nowIso(), userId, profileId).run();
}

export async function addProfileToCollection(
  env: Env,
  userId: string,
  profile: FragranceProfile,
  item: CollectionItem,
): Promise<void> {
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO fragrances (id, profile_json, catalog_version, updated_at) VALUES (?, ?, ?, ?)
    `).bind(profile.id, JSON.stringify(profile), CATALOG_VERSION, now),
    env.DB.prepare(`
      INSERT INTO collection_items (user_id, id, profile_id, active, added_at, notes, image_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(userId, item.id, item.profileId, item.active ? 1 : 0, item.addedAt, item.notes ?? null, item.imageUrl ?? null, now),
  ]);
}

export async function patchPreferences(env: Env, userId: string, patch: Partial<UserPreferences>): Promise<UserPreferences> {
  const current = (await loadState(env, userId)).preferences;
  const next = { ...current, ...patch };
  await env.DB.prepare(`
    UPDATE preferences SET timezone = ?, default_latitude = ?, default_longitude = ?, taste_notes = ?,
      default_setting = ?, updated_at = ? WHERE user_id = ?
  `).bind(next.timezone, next.defaultLatitude, next.defaultLongitude, next.tasteNotes, next.defaultSetting, nowIso(), userId).run();
  return next;
}

export async function replaceWithImportedState(env: Env, userId: string, state: AppState, summary: unknown): Promise<void> {
  const now = nowIso();
  await env.DB.batch(state.catalog.map((profile) => env.DB.prepare(`
    INSERT INTO fragrances (id, profile_json, catalog_version, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at
  `).bind(profile.id, JSON.stringify(profile), CATALOG_VERSION, now)));
  await env.DB.prepare('DELETE FROM collection_items WHERE user_id = ?').bind(userId).run();
  if (state.collection.length) {
    await env.DB.batch(state.collection.map((item) => env.DB.prepare(`
      INSERT INTO collection_items (user_id, id, profile_id, active, added_at, notes, image_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(userId, item.id, item.profileId, item.active ? 1 : 0, item.addedAt, item.notes ?? null, item.imageUrl ?? null, now)));
  }
  for (const log of state.wearLogs) {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO wear_logs (id, user_id, profile_ids_json, worn_at, context_json, enjoyment, strength, longevity, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(log.id, userId, JSON.stringify(log.profileIds), log.wornAt, JSON.stringify(log.context), log.enjoyment ?? null,
      log.strength ?? null, log.longevity ?? null, log.notes ?? null, now).run();
  }
  await patchPreferences(env, userId, state.preferences);
  await env.DB.prepare(`
    INSERT OR REPLACE INTO migration_events (user_id, source, imported_at, summary_json) VALUES (?, 'perfumeday-v1', ?, ?)
  `).bind(userId, now, JSON.stringify(summary)).run();
}

export async function claimAiCall(env: Env, userId: string, date: string, max = 20): Promise<boolean> {
  const row = await env.DB.prepare('SELECT calls FROM ai_usage WHERE user_id = ? AND usage_date = ?').bind(userId, date).first<{ calls: number }>();
  if (Number(row?.calls || 0) >= max) return false;
  await env.DB.prepare(`
    INSERT INTO ai_usage (user_id, usage_date, calls) VALUES (?, ?, 1)
    ON CONFLICT(user_id, usage_date) DO UPDATE SET calls = calls + 1
  `).bind(userId, date).run();
  return true;
}
