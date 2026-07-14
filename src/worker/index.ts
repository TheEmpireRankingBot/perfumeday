import { z } from 'zod';
import { createManualProfile } from '../shared/catalog';
import { migrateLegacyStorage } from '../shared/migration';
import { buildRecommendation, dayPartFromHour, ENGINE_VERSION, hashContext } from '../shared/scoring';
import { OCCASIONS, SETTINGS, VIBES } from '../shared/types';
import type { DailyContext, RecommendationResult, UserPreferences, WeatherContext, WearLog } from '../shared/types';
import {
  claimAiCall,
  addProfileToCollection,
  createWear,
  ensureUser,
  findRecommendation,
  loadState,
  patchPreferences,
  replaceWithImportedState,
  saveRecommendation,
  setCollectionActive,
  updateWear,
} from './db';
import type { Env } from './db';

const weatherSchema = z.object({
  temperatureC: z.number().min(-60).max(70),
  apparentTemperatureC: z.number().min(-70).max(80),
  humidity: z.number().min(0).max(100),
  rainProbability: z.number().min(0).max(100),
  weatherCode: z.number().optional(),
  source: z.enum(['live', 'cached', 'fallback']),
  observedAt: z.string(),
});

const contextSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().min(1).max(80),
  weekday: z.number().int().min(0).max(6),
  dayPart: z.enum(['morning', 'afternoon', 'evening', 'night']),
  occasion: z.enum(OCCASIONS),
  vibe: z.enum(VIBES),
  setting: z.enum(SETTINGS),
  weather: weatherSchema,
});

const recommendationSchema = z.object({ context: contextSchema, force: z.boolean().optional() });
const wearSchema = z.object({ profileIds: z.array(z.string().min(1)).min(1).max(2), context: contextSchema });
const feedbackSchema = z.object({
  enjoyment: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
  strength: z.enum(['too-faint', 'right', 'too-strong']).optional(),
  longevity: z.enum(['short', 'right', 'long']).optional(),
  notes: z.string().max(1000).optional(),
});
const collectionSchema = z.object({ active: z.boolean() });
const manualFragranceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  house: z.string().trim().max(120).default(''),
  edition: z.string().trim().max(120).default(''),
  accords: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
});
const preferencesSchema = z.object({
  timezone: z.string().min(1).max(80).optional(),
  defaultLatitude: z.number().min(-90).max(90).optional(),
  defaultLongitude: z.number().min(-180).max(180).optional(),
  tasteNotes: z.string().max(4000).optional(),
  defaultSetting: z.enum(SETTINGS).optional(),
});
const migrationSchema = z.object({ legacy: z.object({
  sotd_perfumes: z.string().max(1_500_000).nullable(),
  sotd_history: z.string().max(1_500_000).nullable(),
  sotd_taste: z.string().max(10_000).nullable(),
}) });

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const secureHeaders = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: secureHeaders });
}

async function body<T>(request: Request, schema: z.ZodType<T>, maxBytes = 100_000): Promise<T> {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw new HttpError(413, 'Request is too large.');
  let value: unknown;
  try { value = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON body.'); }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message || 'Invalid request.');
  return parsed.data;
}

function identityEmail(request: Request, env: Env): string {
  const email = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (email) return email.toLowerCase();
  const hostname = new URL(request.url).hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'developer@perfumeday.local';
  if (env.REQUIRE_ACCESS !== 'false') throw new HttpError(401, 'PerfumeDay is private. Sign in through Cloudflare Access.');
  return 'owner@perfumeday.local';
}

async function fetchWeather(latitude: number, longitude: number): Promise<WeatherContext> {
  const params = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code',
    daily: 'precipitation_probability_max', forecast_days: '1', timezone: 'auto',
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    headers: { 'User-Agent': 'PerfumeDay/2.0' },
  });
  if (!response.ok) throw new HttpError(502, 'Weather provider is unavailable.');
  const data = await response.json() as {
    current: { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; weather_code: number };
    daily: { precipitation_probability_max: number[] };
  };
  return {
    temperatureC: data.current.temperature_2m,
    apparentTemperatureC: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    rainProbability: data.daily.precipitation_probability_max[0] || 0,
    weatherCode: data.current.weather_code,
    source: 'live',
    observedAt: new Date().toISOString(),
  };
}

function partsInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    weekday: Math.max(0, weekdayNames.indexOf(get('weekday'))),
  };
}

async function scheduledContext(preferences: UserPreferences, date = new Date()): Promise<DailyContext> {
  const local = partsInTimezone(date, preferences.timezone);
  const weekdayWork = local.weekday >= 1 && local.weekday <= 5;
  return {
    date: local.date,
    timezone: preferences.timezone,
    weekday: local.weekday,
    dayPart: dayPartFromHour(local.hour),
    occasion: weekdayWork && local.hour < 18 ? 'Work' : 'Casual',
    vibe: 'Balanced',
    setting: preferences.defaultSetting,
    weather: await fetchWeather(preferences.defaultLatitude, preferences.defaultLongitude),
  };
}

const explanationSchema = z.object({ reasons: z.array(z.string().min(8).max(220)).min(2).max(3) });

async function maybeExplain(env: Env, userId: string, result: RecommendationResult, state: Awaited<ReturnType<typeof loadState>>) {
  if (!env.ANTHROPIC_API_KEY || !env.AI_MODEL) return result;
  if (!await claimAiCall(env, userId, result.date)) return result;
  const winner = state.catalog.find((profile) => profile.id === result.winner.profileId);
  if (!winner) return result;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        max_tokens: 300,
        system: 'You explain a fragrance scoring result. Never select or substitute a fragrance. Return strict JSON only.',
        messages: [{ role: 'user', content: JSON.stringify({
          task: 'Write two concise, concrete reasons for this already-selected fragrance.',
          selected: { house: winner.house, name: winner.name, summary: winner.summary, accords: winner.accords },
          context: result.context,
          scores: result.winner.score,
          deterministicReasons: result.winner.reasons,
          responseShape: { reasons: ['sentence one', 'sentence two'] },
        }) }],
      }),
    });
    if (!response.ok) return result;
    const payload = await response.json() as { content?: Array<{ type: string; text?: string }> };
    const text = payload.content?.find((entry) => entry.type === 'text')?.text;
    if (!text) return result;
    const parsed = explanationSchema.safeParse(JSON.parse(text));
    if (parsed.success) result.winner.reasons = parsed.data.reasons;
  } catch {
    // Explanations are optional. The deterministic result remains authoritative.
  }
  return result;
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const email = identityEmail(request, env);
  const userId = await ensureUser(env, email);

  if (request.method === 'GET' && url.pathname === '/api/bootstrap') return json(await loadState(env, userId));

  if (request.method === 'GET' && url.pathname === '/api/weather') {
    const latitude = z.coerce.number().min(-90).max(90).parse(url.searchParams.get('latitude'));
    const longitude = z.coerce.number().min(-180).max(180).parse(url.searchParams.get('longitude'));
    return json(await fetchWeather(latitude, longitude));
  }

  if (request.method === 'POST' && url.pathname === '/api/recommendations') {
    const input = await body(request, recommendationSchema);
    const state = await loadState(env, userId);
    const contextHash = hashContext(input.context);
    if (!input.force) {
      const existing = await findRecommendation(env, userId, input.context.date, contextHash, ENGINE_VERSION);
      if (existing) return json(existing);
    }
    let result = buildRecommendation(
      state.catalog, state.collection, input.context, state.wearLogs, new Date(), state.preferences.tasteNotes,
    );
    result = await maybeExplain(env, userId, result, state);
    await saveRecommendation(env, userId, result);
    return json(result, 201);
  }

  if (request.method === 'POST' && url.pathname === '/api/wears') {
    const input = await body(request, wearSchema);
    const state = await loadState(env, userId);
    const available = new Set(state.collection.filter((item) => item.active).map((item) => item.profileId));
    if (input.profileIds.some((id) => !available.has(id))) throw new HttpError(400, 'Wear contains a fragrance outside the active wardrobe.');
    const log: WearLog = { id: crypto.randomUUID(), profileIds: input.profileIds, wornAt: new Date().toISOString(), context: input.context };
    await createWear(env, userId, log);
    return json(log, 201);
  }

  const wearMatch = url.pathname.match(/^\/api\/wears\/([^/]+)$/);
  if (request.method === 'PATCH' && wearMatch) {
    const patch = await body(request, feedbackSchema);
    const updated = await updateWear(env, userId, decodeURIComponent(wearMatch[1]), patch);
    if (!updated) throw new HttpError(404, 'Wear not found.');
    return json(updated);
  }

  const collectionMatch = url.pathname.match(/^\/api\/collection\/([^/]+)$/);
  if (request.method === 'PATCH' && collectionMatch) {
    const input = await body(request, collectionSchema);
    const profileId = decodeURIComponent(collectionMatch[1]);
    await setCollectionActive(env, userId, profileId, input.active);
    return json(input);
  }

  if (request.method === 'POST' && url.pathname === '/api/collection') {
    const input = await body(request, manualFragranceSchema);
    const suffix = crypto.randomUUID();
    const profile = createManualProfile(input, `custom-${suffix}`);
    const item = {
      id: `item-${suffix}`,
      profileId: profile.id,
      active: true,
      addedAt: new Date().toISOString(),
    };
    await addProfileToCollection(env, userId, profile, item);
    return json({ profile, item }, 201);
  }

  if (request.method === 'PATCH' && url.pathname === '/api/preferences') {
    const patch = await body(request, preferencesSchema);
    return json(await patchPreferences(env, userId, patch));
  }

  if (request.method === 'POST' && url.pathname === '/api/migration/import-v1') {
    const input = await body(request, migrationSchema, 3_100_000);
    const migrated = migrateLegacyStorage(input.legacy);
    await replaceWithImportedState(env, userId, migrated.state, { imported: migrated.imported, warnings: migrated.warnings });
    return json(await loadState(env, userId), 201);
  }

  throw new HttpError(404, 'API route not found.');
}

async function precomputeAll(env: Env, scheduledTime: number) {
  const users = await env.DB.prepare('SELECT id FROM users').all<{ id: string }>();
  for (const user of users.results) {
    try {
      const state = await loadState(env, user.id);
      const context = await scheduledContext(state.preferences, new Date(scheduledTime));
      const contextHash = hashContext(context);
      const existing = await findRecommendation(env, user.id, context.date, contextHash, ENGINE_VERSION);
      if (!existing) {
        let result = buildRecommendation(
          state.catalog, state.collection, context, state.wearLogs, new Date(scheduledTime), state.preferences.tasteNotes,
        );
        result = await maybeExplain(env, user.id, result, state);
        await saveRecommendation(env, user.id, result);
      }
    } catch (error) {
      console.error('Scheduled recommendation failed', user.id, error);
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!new URL(request.url).pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    try {
      return await handleApi(request, env);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message || 'Invalid request.' }, 400);
      console.error(error);
      return json({ error: 'Unexpected server error.' }, 500);
    }
  },
  async scheduled(controller: ScheduledController, env: Env, context: ExecutionContext): Promise<void> {
    context.waitUntil(precomputeAll(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
