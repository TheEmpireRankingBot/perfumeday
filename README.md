# Scent of the Day — Eau de Jour

A single-page web app that recommends which perfume from your collection to
wear today, based on the weather, the occasion, and what you've worn recently.
It's a self-contained `index.html` — no build step, no backend.

## Features

- **Today** — reads your local weather (via [Open-Meteo](https://open-meteo.com/))
  and picks a scent for your chosen occasion.
- **Shelf** — add your fragrances; the app looks each one up on the web for its
  accords, character, and a bottle photo. You can also upload your own photo.
- **Settings** — store your Anthropic API key (kept only on your device) and
  view your recent wears.

## Running it

**Locally:** just open `index.html` in any modern browser.

**Hosted (GitHub Pages):**
1. Go to the repo's **Settings → Pages**.
2. Under *Source*, choose **Deploy from a branch**, pick `main` and `/ (root)`.
3. Save. Your app will be live at `https://<username>.github.io/perfumeday/`.

> The file **must** be named `index.html` for the site's root URL to load —
> otherwise you get a blank screen. (This was the original bug: the file was
> called `scent-of-the-day_1.html`.)

## API key

The "pick my scent" and "identify fragrance" features call the Anthropic API
directly from your browser. Add your key under **Settings** in the app. It is
stored in your browser's `localStorage` and sent only to `api.anthropic.com` —
never committed to this repo.
