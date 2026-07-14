# PerfumeDay

PerfumeDay is a private, weather-aware fragrance advisor. It opens with one stable daily recommendation from your owned wardrobe, explains the score, lets you override the occasion/mood/setting, and learns gradually from actual wears.

The recommendation winner is deterministic and testable. AI is optional and may only rewrite the explanation for an already-selected winner; it cannot substitute a different fragrance.

## What ships in v2

- Automatic recommendation on open using temperature, apparent temperature, humidity, rain, time, occasion, setting, taste, feedback, and rotation.
- A visible 100-point breakdown across climate, occasion, taste, time, rotation, and vibe.
- Eleven curated starter profiles: Louis Vuitton Imagination, Bujairami Psycho, Van Cleef & Arpels Moonlight Patchouli, Dior Lucky, Dior Homme, Chanel Allure Homme Sport, Giorgio Armani Acqua di Giò, Le Labo Santal 33, LOE White Shirts, Soulvent Pilgrim’s Path, and Montblanc Explorer.
- Quick overrides without changing the default routine.
- D1-backed wardrobe, recommendation locks, wear history, and feedback.
- A one-time importer for the original localStorage/Gist data. API keys, proxy secrets, GitHub tokens, and Gist IDs are deliberately excluded.
- Cloudflare Access-aware identity and a scheduled 06:00 Singapore recommendation.
- Device-local fallback mode when the API or weather service is unavailable.

## Architecture

- React 19 + TypeScript + Vite frontend
- Cloudflare Worker API and static-asset deployment
- Cloudflare D1 database
- Cloudflare Access for the private owner allowlist
- Open-Meteo weather data
- Optional Anthropic explanation generation using a Worker secret

The v1 single-file app and proxy are preserved under `legacy/` for migration reference and rollback. They are not part of the v2 build.

## Local development

Requirements: Node.js 24+ and npm.

```powershell
npm install
npm run db:migrate:local
npm run dev
```

Open `http://127.0.0.1:5173`. Localhost uses a development identity; deployed environments require the Cloudflare Access identity header unless `REQUIRE_ACCESS` is explicitly set to `false`.

If Miniflare cannot fetch its optional `Request.cf` sample because of a restricted network, start it with the fetch disabled:

```powershell
$env:CLOUDFLARE_CF_FETCH_ENABLED='false'
npm run dev
```

## Verification

```powershell
npm run check
```

This runs strict TypeScript checks, the deterministic scoring and migration tests, and a production Worker/client build. GitHub Actions runs the same command for pushes and pull requests.

## Cloudflare deployment

1. Authenticate:

   ```powershell
   npx wrangler login
   ```

2. Run the idempotent provisioner. It finds or creates the Asia-Pacific D1 database, writes its UUID into `wrangler.jsonc`, runs checks, applies migrations, and deploys:

   ```powershell
   npm run provision
   ```

   To configure optional AI explanations during the same flow:

   ```powershell
   npm run provision -- -ConfigureAi
   ```

   `AI_MODEL` is configuration, while the API key remains a Worker secret. Without a key, PerfumeDay uses its built-in deterministic explanations.

3. In Workers & Pages, open PerfumeDay's Domains settings and restrict its `workers.dev` route with Cloudflare Access. Allow only the owner email. The Worker validates the Access JWT's signature, issuer, audience, and email claim; `REQUIRE_ACCESS` fails closed if the token or validation settings are missing. A custom hostname can replace `workers.dev` later.

The scheduled trigger is `0 22 * * *` UTC, which is 06:00 in Singapore. Opening the app from a different location recomputes against live context.

## Recommendation policy

The 100 available points are allocated as follows:

| Factor | Points |
| --- | ---: |
| Climate and environment | 25 |
| Occasion | 25 |
| Personal taste feedback | 20 |
| Daypart | 10 |
| Rotation | 10 |
| Desired vibe | 10 |

Extra context penalties handle hot indoor projection, prior “too strong” feedback in similar conditions, and disliked wears. Feedback uses confidence shrinkage so a single rating cannot dominate the profile.

## Data migration and privacy

On first open at the old origin, the client detects `sotd_perfumes`, `sotd_history`, and `sotd_taste` and imports only those fields. The following v1 values are never sent to the v2 importer:

- `sotd_key`
- `sotd_proxysecret`
- `sotd_gh_token`
- `sotd_gist_id`

After a successful import, `perfumeday-v2-migrated` prevents duplicate imports. The original local data is left intact for manual recovery.
