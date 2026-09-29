# Date by Proxy - an agentic dating site

Paste a LinkedIn + Instagram. Apify scrapes both, an AI agent builds an evidence-backed profile, then your agent goes on real LLM dates with other people's agents and ranks who fits you best.

- **Live site:** https://agentic-dating-app.vercel.app/
- **Demo (already run, no typing):** https://agentic-dating-app.vercel.app/people/fe8acb64-ea98-4d8a-93be-e72979be3e7a - Ashneer Grover, added through the public "Add yourself" flow: scraped LinkedIn + Instagram, evidence-backed profile, 9 dates, ranking. Also [/people](https://agentic-dating-app.vercel.app/people), [/date-night](https://agentic-dating-app.vercel.app/date-night), [/rankings](https://agentic-dating-app.vercel.app/rankings).
- **Video:** _add YouTube URL_

**In 200 characters:** Paste a LinkedIn + Instagram. Apify scrapes both, an AI agent builds an evidence-backed profile, then your agent goes on real 8-turn dates with other agents and ranks who fits you best.

## How it works

```
LinkedIn URL + public Instagram URL
   │
   ├─ Apify: harvestapi/linkedin-profile-scraper   (profile, experience, education, skills…)
   └─ Apify: apify/instagram-profile-scraper       (bio, 12 latest posts, captions, hashtags, photos)
   │
   ▼  raw JSON → Postgres, photos rehosted → Supabase Storage (IG CDN links expire)
Analyst agent
   ├─ vision model describes 6 Instagram photos
   └─ reasoning model writes the profile: needs, hobbies, interests, values, lifestyle,
      personality, dealbreakers - every insight with evidence (source + field/post + quote) and confidence
   ▼
Dating agents (one per person, each knows ONLY its own person)
   └─ 8-message date: icebreaker → lifestyle → values & goals → dealbreakers
      every message is a separate LLM call; the two sides run on different models
   ▼
Private verdicts (one per side): fit, chemistry, values, lifestyle, dealbreaker hit, second date, reasons + quotes
   ▼
Ranking per person: 0.7 × my verdict + 0.3 × their verdict − 3 (dealbreaker) + 0.5 (mutual second date)
```

- The seed pool is 30 real people (founders/creators whose LinkedIn and public Instagram are verifiably the same person: both scraped, names matched, headline and bio cross-checked; 15 candidates were rejected, including 3 LinkedIn namesakes).
- Who dates whom: a date only happens if each person is someone the other wants to meet. Visitors pick women / men / everyone. The seed pool defaults to opposite-gender matching, using a gender the Analyst reads only from explicit signals in the person's own profiles (pronouns, "Mom"/"Dad", their own profile photo) and cites as evidence. Orientation is never inferred.
- The pool is 9 women and 21 men, so 189 dates were run (every woman × every man): ~1,500 agent messages and 378 private verdicts.
- Visitors who paste their links get the same pipeline live: scrape → analysis → a date with every matching agent (streamed on screen) → their ranking.
- The browser orchestrates the pipeline in short API calls (Apify runs are started async and polled), so nothing hits a serverless timeout.
- No sensitive-trait inference (religion, ethnicity, orientation, health, politics).

## Technical: scraping Instagram and LinkedIn

- **Apify** via `apify-client`.
  - LinkedIn: `harvestapi/linkedin-profile-scraper` (no cookies; input `{ profileScraperMode: "Profile details no email ($4 per 1k)", queries: [urls] }`). The free plan caps it at 10 profiles per run, so the seed was scraped in batches of 10.
  - Instagram: `apify/instagram-profile-scraper` (input `{ usernames: [...] }`), returns bio, counts and the latest 12 posts with captions, hashtags, alt text and image URLs.
- Raw actor output is stored in `sources.raw` (jsonb) so every insight is auditable; Instagram photos are copied to Supabase Storage at ingest.

## Stack

Next.js 16 (App Router) + TypeScript + Tailwind v4 · Supabase Postgres + Storage · Apify · Groq (OpenAI-compatible API) with zod-validated JSON:
`openai/gpt-oss-120b` (analysis + verdicts), `openai/gpt-oss-20b` + `qwen/qwen3.6-27b` / `qwen/qwen3.8-27b` (date turns), `qwen/qwen3.8-27b` vision (Instagram photos) · Vercel.

## Run it locally

```bash
npm install
cp .env.example .env.local            # fill in keys
# run supabase/schema.sql in the Supabase SQL editor
npx tsx --env-file=.env.local scripts/discover.ts   # scrape + verify candidates (data/candidates.csv → data/people.csv)
npx tsx --env-file=.env.local scripts/seed.ts       # store sources, rehost photos, run Analyst agent
npx tsx --env-file=.env.local scripts/pool.ts       # run every matching date + rankings
npm run dev
```

## Code map

| Path | What |
|---|---|
| `src/lib/apify.ts` | Actor runs, polling, URL normalisation |
| `src/lib/ingest.ts` | Store raw scrape, rehost images |
| `src/lib/analyst.ts`, `profile-schema.ts` | Analyst agent (vision + profile with evidence) |
| `src/lib/dating.ts` | Dating agents, 8-turn protocol, private verdicts |
| `src/lib/ranking.ts` | Ranking formula |
| `src/app/api/*` | Short, resumable pipeline steps used by the browser |
| `src/app/people/[id]` | Profile page with evidence popovers |
| `src/app/date-night`, `src/app/dates/[id]` | Live date grid and transcripts + verdicts |
| `src/app/rankings` | Everyone's top 5 and strongest mutual matches |
