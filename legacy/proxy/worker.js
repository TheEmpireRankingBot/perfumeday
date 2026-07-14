/**
 * Scent of the Day — Anthropic proxy (Cloudflare Worker)
 *
 * Holds your Anthropic API key as a SERVER-SIDE secret so it never ships inside
 * the public web app. The app POSTs the same body it would send to Anthropic;
 * this Worker adds the key and forwards the request to the Messages API.
 *
 * Secrets / vars (set with wrangler, NOT in this file or wrangler.toml):
 *   ANTHROPIC_API_KEY  (required)  wrangler secret put ANTHROPIC_API_KEY
 *   APP_SECRET         (optional)  wrangler secret put APP_SECRET
 *                                  if set, the app must send x-app-secret to match
 *   ALLOWED_ORIGIN     (optional)  your site origin, e.g. https://you.github.io
 *                                  restricts CORS; defaults to * when unset
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

function corsHeaders(env, origin) {
  const allowed = env.ALLOWED_ORIGIN || '';
  const allowOrigin = allowed ? (origin === allowed ? origin : allowed) : '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-app-secret',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(env, origin);

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: { message: 'Method not allowed' } }, 405, cors);

    if (env.APP_SECRET && request.headers.get('x-app-secret') !== env.APP_SECRET) {
      return json({ error: { message: 'Unauthorized' } }, 401, cors);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: { message: 'Proxy missing ANTHROPIC_API_KEY secret' } }, 500, cors);
    }

    const body = await request.text();
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    };
    // pass through the beta header so client features like web search keep working
    const beta = request.headers.get('anthropic-beta');
    if (beta) headers['anthropic-beta'] = beta;

    let upstream;
    try {
      upstream = await fetch(ANTHROPIC_URL, { method: 'POST', headers, body });
    } catch (e) {
      return json({ error: { message: 'Upstream request failed: ' + e.message } }, 502, cors);
    }
    // return Anthropic's response verbatim (never echo the key)
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  },
};
