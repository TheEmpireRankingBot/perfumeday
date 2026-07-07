# Scent of the Day — Eau de Jour

A single-page web app that recommends which perfume from your collection to
wear today, based on the weather, the occasion, and what you've worn recently.
It's a self-contained `index.html` — no build step, no backend.

## Features

- **Today** — reads your local weather (via [Open-Meteo](https://open-meteo.com/))
  and picks a scent for your chosen occasion.
- **Shelf** — add your fragrances; the app looks each one up on the web for its
  accords, character, and a bottle photo. You can also upload your own photo.
- **Settings** — connect the AI (via a key-safe proxy, or a local key), record
  your taste, enable cross-device sync, and view your recent wears.

## Running it

**Locally:** just open `index.html` in any modern browser.

**Hosted (GitHub Pages):**
1. Go to the repo's **Settings → Pages**.
2. Under *Source*, choose **Deploy from a branch**, pick `main` and `/ (root)`.
3. Save. Your app will be live at `https://<username>.github.io/perfumeday/`.

> The file **must** be named `index.html` for the site's root URL to load —
> otherwise you get a blank screen. (This was the original bug: the file was
> called `scent-of-the-day_1.html`.)

## Advisor memory

The app remembers your taste so its picks improve over time:

- **Preference notes** — under **Settings → Advisor memory**, jot down anything
  ("love vanilla in winter", "nothing heavy at the office", "rose makes me
  sneeze"). The advisor reads these on every pick.
- **Post-wear reactions** — after you tap *Wear it*, rate how it went (Loved it
  / Solid / Too strong / Too faint / Wrong vibe). Those reactions are folded
  into future recommendations, so the nose leans toward what you've loved and
  steers clear of what didn't work.

A pick can be a **single scent or a layered pair** — when two fragrances on your
shelf would combine into something better for the day, the advisor suggests a
combo, naming the base (sprayed first, on skin) and the top, with how to apply
each. Rating a combo teaches your taste memory just like a single wear.

All of it persists locally and syncs across devices along with your shelf.

## Syncing across devices

The app can keep your shelf, wear history, and photos in step between your
phone and PC through a **private GitHub Gist** — no server required.

1. Create a token at
   [github.com/settings/tokens](https://github.com/settings/tokens/new?scopes=gist&description=Scent+of+the+Day)
   with **only the `gist` scope** ticked.
2. In the app, open **Settings → Cloud sync**, paste the token, and tap
   **Enable sync**. The app creates one private Gist to hold your data.
3. Repeat on your other device with the **same token**. That's it.

After that it syncs automatically: it pulls when the app opens and pushes a
moment after any change, plus there's a **Sync now** button. Edits from both
devices are merged per bottle, and deletions carry across (they won't come
back from a stale copy). The token is stored only on each device — never in
the Gist.

## Keeping your API key safe (proxy)

This is a **public** site, so it can never contain your Anthropic API key: any
key placed in the code (or committed to the repo) is scraped and **auto-revoked**
by Anthropic's secret scanning. The safe way to power the AI features is a tiny
proxy that holds the key as a **server secret** and forwards requests to
Anthropic. The app calls the proxy — the key is never in the repo or any browser.

A ready-to-deploy [Cloudflare Worker](https://developers.cloudflare.com/workers/)
lives in [`proxy/`](proxy/). Free tier is plenty.

```bash
npm install -g wrangler          # one-time
cd proxy
wrangler login
wrangler deploy                  # prints your Worker URL
wrangler secret put ANTHROPIC_API_KEY   # paste your sk-ant-… key when prompted
# optional hardening:
wrangler secret put APP_SECRET   # a random string; also enter it in the app
```

Then in the app open **Settings → Connection**, paste the Worker URL into
**Proxy URL** (and the `APP_SECRET`, if you set one). Done — every device uses
the proxy and no key ever touches the client.

To lock the proxy to your site only, uncomment `ALLOWED_ORIGIN` in
[`proxy/wrangler.toml`](proxy/wrangler.toml) and redeploy. Since anyone who
learns the Worker URL could call it, don't publish the URL, and set an
`APP_SECRET` if you want an extra gate.

### Direct-key fallback (local use only)

For running `index.html` straight off your disk you can instead paste a key into
**Settings → Anthropic API key**. It's stored only in that browser's
`localStorage` and sent straight to `api.anthropic.com`. **Never** use this on the
hosted public site, and never hardcode or commit a key.
