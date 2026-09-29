# PRD: Agentic Dating Site ("Date by Proxy")

**Time budget:** 3 hours, end to end (build + deploy + video + submission).
**Rule #1:** Nothing is mocked. Real people, real scraping (Apify), real LLM agents, real dates, real rankings.
**Rule #2:** For every person, the ONLY sources of information are their LinkedIn and their public Instagram. Nothing else.

---

## 1. What we are building (one paragraph)

A website where every person is represented by an AI agent. You paste a LinkedIn URL and a public Instagram URL. Apify scrapes both. An **Analyst agent** reads everything and builds a profile page (needs, hobbies, interests, values, lifestyle, personality, dealbreakers), with every claim linked to the exact LinkedIn field or Instagram post it came from. Then that person's **Dating agent** goes on real, turn-by-turn LLM dates with every other person's Dating agent. Each agent only knows its own person. After each date, each agent privately writes a verdict. Those verdicts produce a **ranking for each person**: who fits them best.

## 2. How we get full marks (grading map)

| What graders look at | Weight | How we win it |
|---|---|---|
| Video: 25 real people, agents dating, analysis, profiles, rankings, max 3 min | Highest | Tight script (section 11). Live "Date Night" screen with 300 dates streaming. Profile pages with evidence. Ranking screen. |
| Creativity + how well we use each person's data | High | Evidence-linked insights (each tag shows the LinkedIn field / IG post thumbnail it came from). Vision on IG photos. Confidence scores. Agents cite evidence in verdicts. Mutual-match badges. |
| Explanation of how it works | Medium | `/how-it-works` page + README with architecture diagram + technical section. |
| Repo | Lower | Clean, public, README, `.env.example`, one-command seed. |
| Website must work (they paste their own links) | Pass/fail | Client-orchestrated pipeline (no serverless timeouts), clear progress UI, graceful partial-data handling. Tested with our own links before submitting. |

**Pass condition (must be visible in video):** profile page for each person, then dates actually happening, then rankings, all in 3 minutes or less.

## 3. Non-negotiables

1. At least 25 real people, each with a working LinkedIn URL and a **public** Instagram. Collect **30** so there is a buffer if scrapes fail.
2. No mock data, no hardcoded profiles, no fake transcripts. If a field is missing, show "Not available from sources", never invent.
3. Agents never see the other person's profile. Agent A only knows A. They learn about B only through the date conversation.
4. The analysis must never invent facts. Every insight has `evidence[]` + `confidence`.
5. Do not infer sensitive traits: religion, ethnicity, sexual orientation, health, politics. Gender/orientation is not stated in the sources, so the ranking is "who fits you best" across the whole pool (state this in the README).
6. Demo link = finished example, already run. No typing needed to see it.
7. Live site = anyone can paste their own links and get the full flow.

## 4. Tech stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui | Fast to build, one deploy for UI + API |
| Hosting | Vercel | Instant deploy, free |
| DB + file storage | Supabase (Postgres + Storage bucket `ig-images`) | Persist people, profiles, dates; rehost IG images |
| Scraping | Apify via `apify-client` (npm) | Required; handles LinkedIn/IG blocking |
| LLM | **Groq** via the `openai` npm SDK pointed at `https://api.groq.com/openai/v1` (OpenAI-compatible). JSON output + `zod` validation | Very fast inference (dates stream quickly on video), cheap. One `lib/llm.ts` wrapper so the provider is just env config |
| Models | Vision analysis: `meta-llama/llama-4-scout-17b-16e-instruct`. Text analysis + verdicts: `llama-3.3-70b-versatile` (or `openai/gpt-oss-120b`). Date turns: `llama-3.1-8b-instant` (or `openai/gpt-oss-20b`) | Check [console.groq.com/docs/models](https://console.groq.com/docs/models) at step 0; model IDs change |
| Concurrency | `p-limit` | Control parallel dates (Groq rate limits) |

**Groq specifics (read before coding the LLM layer):**
- **Rate limits are the main risk.** Free tier is roughly 30 requests/min and a daily token cap per model. 300 dates x 10 calls = ~3,000 calls and several million tokens, which the free tier cannot do in time. **Upgrade the Groq org to the Developer (pay-as-you-go) tier at minute 0**; total spend is a few dollars.
- If stuck on free tier: limits are per model, so rotate date turns across 2-3 small models; keep personas compact (~400 tokens); cap dates at 6 turns; and reduce the pool round to each person dating 12 others (150 dates) instead of all 300.
- JSON: use `response_format: { type: "json_object" }` (or `json_schema` on models that support it), always validate with `zod`, retry once on parse failure with the zod error in the prompt.
- Vision: Llama 4 Scout accepts at most ~5 images per request. Send the 5 most informative IG posts in call 1; if there are more, do a second call and merge.
- Retry on HTTP 429 using the `retry-after` header, exponential backoff, max 3 tries.

**Env vars (`.env.example`):**
```
APIFY_TOKEN=
GROQ_API_KEY=
LLM_BASE_URL=https://api.groq.com/openai/v1
MODEL_VISION=meta-llama/llama-4-scout-17b-16e-instruct
MODEL_SMART=llama-3.3-70b-versatile
MODEL_FAST=llama-3.1-8b-instant
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_SECRET=            # protects "run all pool dates" endpoint
```

## 5. Apify scraping

**Step 0 of build:** open each actor in the Apify console, run it once on one real profile, confirm the input field names and output shape. Actor input schemas change; do not guess.

| Source | Primary actor | Fallback actor | Input |
|---|---|---|---|
| LinkedIn profile | `harvestapi/linkedin-profile-scraper` (no cookies, works via API on free plan, $4 / 1k) | `dev_fusion/linkedin-profile-scraper` (**free plan: console UI only, no API, max 10 profiles/run, 10 runs/day**, so only usable for manual seeding) | harvestapi: `{ "profileScraperMode": "Profile details no email ($4 per 1k)", "queries": [urls] }`; dev_fusion: `{ "profileUrls": [urls] }` |
| LinkedIn posts (optional, richer) | `harvestapi/linkedin-profile-posts` | skip if short on time | profile URL, limit ~10 |
| Instagram profile + latest posts | `apify/instagram-profile-scraper` | `apify/instagram-scraper` | array of usernames |
| Instagram more posts (optional) | `apify/instagram-post-scraper` | - | username, `resultsLimit: 20` |

**Apify cost (Free plan, verified on apify.com):** Free plan = $0/month with $5 usage credit every month, no credit card, max 5 concurrent runs. When the $5 runs out, the account is blocked until next month, so watch the billing page.
- LinkedIn via harvestapi: $4 / 1,000 profiles, so 35 profiles = ~$0.14.
- Instagram via `apify/instagram-profile-scraper`: $2.60 / 1,000 results on Free, so 35 profiles = ~$0.09.
- Seed pool + testing + ~100 live-site users stays well under $5. **Apify is effectively free for this project.**
- Never enable the email-search mode (it costs $10 / 1k and we don't need emails).

**What we keep:**
- LinkedIn: name, headline, about, location, current role/company, experience (titles, companies, durations, descriptions), education, skills, languages, certifications, volunteering, recent posts text, profile photo URL.
- Instagram: username, full name, bio, external link, followers/following, post count, profile pic, latest 12-20 posts (caption, hashtags, location tag, timestamp, likes, image URL, type).

**Rules:**
- Batch: for the 25-person seed, send ALL URLs in ONE actor run per source (2 runs total, not 50).
- Live user: start runs async (`client.actor(id).start(input)`), return `runId`, frontend polls status. Never block a serverless function waiting for Apify.
- **Rehost images**: Instagram CDN URLs expire and are often blocked for hotlinking. At ingest, download profile pic + up to 8 post images and upload to Supabase Storage. Store our public URLs.
- Store raw Apify JSON in `sources.raw` (jsonb). Proves nothing is mocked; lets us re-run analysis without re-scraping.
- If IG is private or LinkedIn fails: mark source `failed` with reason; continue with what we have; UI shows it honestly.

## 6. Architecture and pipeline

```
[Paste LinkedIn + IG]
        |
        v
  1. INGEST  --(Apify LinkedIn run)--+
             --(Apify IG run)--------+--> sources (raw JSON) + rehosted images
        |
        v
  2. ANALYST AGENT (vision + text, structured output)
        |--> profiles (needs, hobbies, interests, values, lifestyle,
        |              personality, dealbreakers, evidence, confidence)
        v
  3. DATING AGENT persona built from profile (private to that person)
        |
        v
  4. DATES: agent A <-> agent B, turn by turn (each turn = separate LLM call
            that only sees its own persona + transcript so far)
        |--> date_messages (live stream to UI)
        v
  5. VERDICTS: each agent privately scores the date (0-10 + reasons + evidence quotes)
        |
        v
  6. RANKING per person (formula in section 8) --> rankings
```

**Timeout-proof design (critical for the live site):** the browser orchestrates the pipeline by calling short API routes one step at a time. Every API call finishes in well under 60s.

```
POST /api/ingest            -> creates person + starts both Apify runs, returns { personId, runIds }
GET  /api/ingest/status     -> polls Apify; when done, saves raw + rehosts images
POST /api/analyze           -> runs Analyst agent for personId (~20-40s)
POST /api/dates/run         -> runs ONE full date between A and B, writes messages as it goes
POST /api/verdicts/run      -> (can be inside dates/run) both verdicts for a date
POST /api/rankings/compute  -> computes ranking for personId
GET  /api/dates/:id         -> transcript (UI polls every 1s for live view)
POST /api/admin/run-pool    -> (ADMIN_SECRET) returns all pairs to run; client runs them with concurrency 10
```

## 7. Agents (the core, spend time here)

### 7.1 Analyst agent
Input: cleaned LinkedIn JSON + IG bio + captions + hashtags + locations + up to 8 post images.
Two steps on Groq: (a) `MODEL_VISION` describes the photos (max ~5 images per call, so 1-2 calls) into short text notes keyed by postId; (b) `MODEL_SMART` builds the full profile from LinkedIn + IG text + photo notes.
Output (zod schema, structured output):

```ts
Profile = {
  name, headline, location,
  oneLiner: string,                 // "Product designer in Bangalore who lives for trail runs and film cameras"
  career: { current, trajectory, ambitionLevel: 1-5, workStyle },
  education: string[],
  hobbies:    Insight[],            // hiking, pottery, chess...
  interests:  Insight[],            // AI, indie music, climate...
  values:     Insight[],            // growth, family, adventure...
  lifestyle: { travel, fitness, social, food, pace: Insight[] },
  personality: { openness, conscientiousness, extraversion, agreeableness, neuroticism: {score:1-5, why, evidence} },
  communicationStyle: string,       // from captions/posts tone
  needs:        Insight[],          // what they likely need in a partner
  dealbreakers: Insight[],          // inferred, low confidence allowed
  greenFlags:   string[],
  conversationStarters: string[],
  photoHighlights: { imageUrl, whatItShows }[]
}
Insight = { label, detail, confidence: 0-1,
            evidence: { source: "linkedin" | "instagram", ref: string /* field or postId */, quote: string, imageUrl?: string }[] }
```

System prompt rules: only use provided data; every insight needs at least one evidence item; mark inferences with lower confidence; no sensitive-trait inference; say "unknown" rather than guess.

### 7.2 Dating agent persona
Built from the profile. First-person, speaks FOR the person (not as them pretending to be human; it is their representative). Private mission:
- Represent my person truthfully using only their profile.
- Find out whether the other person fits my person's needs, values, lifestyle, and dealbreakers.
- Ask real questions, share real details, be warm but honest; probe dealbreakers politely.

### 7.3 Date protocol (one date = 8 messages)
Each message is a separate LLM call. The speaking agent sees only: its own persona + the transcript so far + the current phase.

| Turn | Phase | Goal |
|---|---|---|
| 1-2 | Icebreaker | Intros, a hook from a real hobby/photo |
| 3-4 | Lifestyle | Weekends, travel, fitness, social life, pace of life |
| 5-6 | Values + goals | Career ambition, what matters, what they want in a partner |
| 7-8 | Dealbreaker probe + close | Politely test dealbreakers, wrap up |

Max ~60 words per message. A opens on even-indexed pairs, B on odd, so it is fair.

### 7.4 Verdict (private, after each date, one per side)
```ts
Verdict = { fitScore: 0-10, chemistry: 0-10, valuesAlignment: 0-10, lifestyleFit: 0-10,
            dealbreakerHit: boolean, wantsSecondDate: boolean,
            topReasons: string[3], concerns: string[],
            evidence: { quoteFromDate: string, linkedToMyNeed: string }[] }
```

### 7.5 Stretch (only if ahead of schedule): Second date
For each person's top 3, run a second, deeper 6-message date and re-score. Great for the video ("agents go on a second date").

## 8. Ranking formula

For person A, for each candidate B they dated:

```
myView     = A's verdict of B: 0.4*fit + 0.2*chemistry + 0.25*values + 0.15*lifestyle
theirView  = B's verdict of A (same formula)
score(A,B) = 0.7*myView + 0.3*theirView
             - 3 if A's agent flagged dealbreakerHit
             + 0.5 if both wantsSecondDate  -> "Mutual match" badge
```
Rank descending. Show top reasons + a link to the date transcript for each rank. The ranking comes from the dates, so the dates actually matter.

## 9. Data model (Supabase SQL)

```sql
create table people (
  id uuid primary key default gen_random_uuid(),
  name text, linkedin_url text not null, instagram_url text not null,
  photo_url text, is_seed boolean default true,
  status text default 'new',  -- new|scraping|scraped|analyzing|ready|dating|ranked|failed
  created_at timestamptz default now()
);
create table sources (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people on delete cascade,
  kind text check (kind in ('linkedin','instagram')),
  apify_run_id text, status text, error text,
  raw jsonb, images text[], created_at timestamptz default now()
);
create table profiles (
  person_id uuid primary key references people on delete cascade,
  data jsonb not null, model text, created_at timestamptz default now()
);
create table dates (
  id uuid primary key default gen_random_uuid(),
  a_id uuid references people, b_id uuid references people,
  round int default 1, status text default 'pending', -- pending|live|done|failed
  created_at timestamptz default now(), unique (a_id, b_id, round)
);
create table date_messages (
  id bigserial primary key, date_id uuid references dates on delete cascade,
  speaker_id uuid references people, turn int, phase text, content text,
  created_at timestamptz default now()
);
create table verdicts (
  date_id uuid references dates on delete cascade, judge_id uuid references people,
  about_id uuid references people, data jsonb, primary key (date_id, judge_id)
);
create table rankings (
  person_id uuid references people on delete cascade, candidate_id uuid references people,
  rank int, score numeric, mutual boolean, reasons text[], date_id uuid,
  primary key (person_id, candidate_id)
);
```

## 10. Pages (UI)

Design: dark, elegant, "dating app" feel (serif headings, warm accent). Real photos everywhere.

| Route | What it shows |
|---|---|
| `/` | Hero ("Your agent dates for you"), paste form (LinkedIn + IG), buttons: "See the demo (25 people)" and "How it works" |
| `/people` | Grid of all 25+ people: photo, name, one-liner, top 3 tags, status |
| `/people/[id]` | **Profile page**: sources panel (LinkedIn/IG links + scrape status), one-liner, needs, hobbies, interests, values, lifestyle, personality bars, dealbreakers. Each tag is clickable and shows its evidence (LinkedIn field text or IG post thumbnail + caption) and confidence. Tabs: Dates, Ranking |
| `/date-night` | Live grid of all dates: status chips (pending/live/done), live-updating message counters, click to open. "Run all dates" button (admin secret) used in the video |
| `/dates/[id]` | Chat-style transcript with both photos, phase dividers, both private verdicts side by side (scores, reasons, evidence quotes) |
| `/rankings` | Every person with their top 5 matches (photo chips, scores, mutual badge). Click to expand full ranking |
| `/join/[personId]` | Live pipeline for a pasted user: Scraping LinkedIn, Scraping Instagram, Analysing, Dating (x/25 with live transcripts), Ranking, then results |
| `/how-it-works` | Architecture diagram, agent design, ranking formula, tech stack, scraping approach |

## 11. Video script (max 3:00, record at 1080p, cut dead time)

| Time | Show | Say |
|---|---|---|
| 0:00-0:12 | Landing page | "Every person gets an AI agent. The agents date each other. Here are 25 real people." |
| 0:12-0:35 | Paste own LinkedIn + IG on live site, progress: Apify scraping | "Only two sources: LinkedIn and public Instagram, scraped with Apify." |
| 0:35-1:05 | `/people` grid (scroll all 25), open 2 profile pages, click a tag to show IG post evidence | "The Analyst agent reads everything, including photos, and builds needs, hobbies, interests, values. Every insight links back to its source." |
| 1:05-1:55 | `/date-night`: click "Run all dates", 300 dates stream live. Open one transcript as it types. Show both verdicts | "Each agent only knows its own person. They go on 8-message dates: icebreaker, lifestyle, values, dealbreakers. Then each writes a private verdict." |
| 1:55-2:30 | `/rankings`, then one person's full ranking with reasons + mutual badges; then the live user's result | "Verdicts from both sides become a ranking for every person." |
| 2:30-3:00 | `/how-it-works` diagram | Stack, pipeline, repo link |

Tips: pre-run the full pool once (for the demo link), then for the video reset round-1 dates (or run round 2) so dates visibly happen live. Speed up long waits 2-4x in the edit.

## 12. 3-hour timeline

| Time | Task | Done when |
|---|---|---|
| 0:00-0:15 | Accounts + keys (Apify, Groq + upgrade to Developer tier, Supabase, Vercel, GitHub). `create-next-app`, Tailwind, shadcn, Supabase SQL. **In parallel: start collecting 30 people into `data/people.csv`** (name, linkedin_url, instagram_url) | App runs locally, tables exist |
| 0:15-0:45 | Ingest: Apify client, LinkedIn + IG actors, raw storage, image rehosting. Test on 2 people, then batch-run all 30 | 25+ people with both sources `done` |
| 0:45-1:15 | Analyst agent + `/people` + `/people/[id]` with evidence popovers | 25 profile pages look great |
| 1:15-1:50 | Dating engine (turn-by-turn), verdicts, `/date-night`, `/dates/[id]`. Run all 300 pool dates (concurrency 10) | 300 dates `done`, transcripts readable |
| 1:50-2:05 | Ranking compute + `/rankings` + ranking tab on profile | Every person has a ranking |
| 2:05-2:20 | Live `/join` flow, deploy to Vercel, env vars, test with own links on prod | Stranger can paste links and get a ranking |
| 2:20-2:45 | `/how-it-works`, README, record + edit video, upload YouTube (unlisted/public) | Video under 3:00 |
| 2:45-3:00 | Final checks (section 14), submit | Submitted |

**Cut list if behind (in this order):** second dates, LinkedIn posts actor, extra IG posts actor, personality bars, `/how-it-works` page (keep README). Never cut: real scraping, profile pages, live dates, rankings, live paste flow.

## 13. Cost and speed budget

- Apify: ~60 profile scrapes total, a few dollars at most (free $5 credit likely covers it).
- Groq: 300 dates x (8 turns + 2 verdicts) = ~3,000 small calls + ~60 analysis calls, roughly 4-5M tokens. A few dollars on the Developer tier (not feasible on free tier in 3 hours, see section 4).
- Speed: Groq turns take well under 1s, so with concurrency 10 the 300 dates finish in a few minutes (rate limits, not speed, are the bottleneck). A live user's 25 dates finish in about a minute.
- Handle 429s with `retry-after` + backoff (3 tries).

## 14. Submission checklist

- [ ] **YouTube** link: 25 real people, profile pages first, then dates, then rankings, under 3:00
- [ ] **Demo link**: `/people` (or `/rankings`) on prod, already run, no typing needed
- [ ] **Live website**: prod URL, tested with a fresh pair of links
- [ ] **GitHub**: public repo, README, `.env.example`, no secrets committed
- [ ] **Overall explanation (max 200 chars)**, draft (185 chars):
  > Paste a LinkedIn + Instagram. Apify scrapes both, an AI agent builds an evidence-backed profile, then your agent goes on real LLM dates with 25 other agents and ranks who fits you best.
- [ ] **Technical section** draft:
  > Scraping: Apify (`harvestapi/linkedin-profile-scraper` for LinkedIn, `apify/instagram-profile-scraper` for public Instagram) via `apify-client`, async runs + polling, raw JSON stored, IG images rehosted to Supabase Storage. App: Next.js 15 + TypeScript + Tailwind on Vercel, Supabase Postgres. Agents: Groq (OpenAI-compatible API) with JSON output validated by zod; Llama 4 Scout vision for IG photos, Llama 3.3 70B for profile analysis and private verdicts, Llama 3.1 8B for fast turn-by-turn dates.

## 15. Risks and fallbacks

| Risk | Fallback |
|---|---|
| Collecting 25 people with public IG + LinkedIn takes too long | Start at minute 0 in parallel. Collect 30. Friends, classmates, founders/creators who publicly link both. |
| LinkedIn actor fails / returns thin data | Switch to fallback actor (already verified in step 0). Keep partial data, show it honestly. |
| Apify $5 free credit runs out (account blocked till next month) | Costs are ~$0.01 per person, so only abuse can do this. Per-IP limit on live site; check billing page after seeding; a second free account's token is the emergency backup. |
| IG private or rate-limited | Pick another person from the buffer of 30. |
| Vercel function timeout | Client orchestration, one date per request, Apify async + polling. |
| Groq rate limits (biggest LLM risk) | Developer tier from minute 0. `p-limit(10)`, `retry-after` backoff, compact personas, rotate small models, fall back to 12 dates per person. |
| Groq model deprecated / renamed | Model IDs live in env vars; swap without code changes. |
| Hallucinated insights | Evidence required per insight, low confidence shown, "unknown" allowed. |
| IG images not loading | Rehosted in Supabase Storage at ingest. |
| Live user abuse / cost | Simple per-IP limit (e.g. 3 runs/hour), cap live user dates to the 25 seed pool. |

## 16. Definition of done

1. 25+ real people in prod, each with a profile page showing evidence-backed needs, hobbies, interests, values.
2. 300 completed agent-to-agent dates with full transcripts and two private verdicts each.
3. Every person has a ranking with reasons and links to the date.
4. A stranger can paste their own LinkedIn + public IG on the live site and get: scrape, profile, 25 dates, ranking.
5. Video under 3:00 shows profiles, then dates, then rankings.
6. Public repo, README, submission text done.
