# Job Hunter

Scrapes job boards on a schedule, stores listings in Supabase, and emails you a
digest of new matches per hunt profile. A Next.js web app lets you browse the
board, track applications, and tailor resumes for specific roles.

## Sources

Toggle sources in `config/config.js`. Each maps to a file in `src/scrapers/`.

| Source | Method | Notes |
| --- | --- | --- |
| RemoteOK | Free API | |
| Remotive | API + RSS + Playwright | API/RSS cover ~30 recent jobs; browser scrape adds category/search coverage |
| The Muse | Free API | Paginated public jobs API |
| We Work Remotely | RSS | Multiple official category feeds |
| Hacker News "Who is hiring?" | Algolia API | New thread on the 1st of each month |
| USAJobs.gov | Official API | Skipped if `USAJOBS_API_KEY` / `USAJOBS_USER_AGENT` are not set |
| Dice | Playwright | Searches all US states; slow and fragile — disable in config if it breaks |
| Jobspresso | Playwright | WP Job Manager listings + detail-page enrichment |
| Authentic Jobs | Playwright | Same stack as Jobspresso |
| Idealist | Playwright | Nonprofit/mission-driven roles |
| Work at a Startup (YC) | Playwright | Main board + role category pages |
| PowerToFly | Playwright | US job listings via infinite scroll |

**Playwright scrapers** (Dice, Remotive browser leg, Jobspresso, Authentic Jobs,
Idealist, Work at a Startup, PowerToFly) need Chromium installed locally and in
CI.

**Not wired up yet** (commented in config): remote.co, Wellfound, Welcome to the
Jungle.

## Setup

Requires **Node 22+**.

1. **Install dependencies**

   ```bash
   npm install
   npx playwright install chromium   # required for Playwright scrapers
   ```

2. **Environment variables** — copy `.env.example` to `.env` and fill in:
   - `SUPABASE_URL` — your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard → Project Settings → API
     Keys → `service_role` (keep secret)
   - `EMAIL_TO` — where the digest goes on first run (bootstraps a default
     subscriber + profile if none exist)
   - `RESEND_API_KEY` — free account at [resend.com](https://resend.com).
     The default `onboarding@resend.dev` sender works without domain setup, but
     can only send to the email you signed up with.
   - Optional: `EMAIL_FROM` (defaults to Resend's onboarding sender)
   - `USAJOBS_API_KEY` / `USAJOBS_USER_AGENT` — free key from
     [developer.usajobs.gov/apirequest](https://developer.usajobs.gov/apirequest/)
     (user agent is your email address)

   To use Gmail instead of Resend: set `EMAIL_PROVIDER=gmail` plus `GMAIL_USER`
   and `GMAIL_APP_PASSWORD` (an
   [app password](https://myaccount.google.com/apppasswords), not your real
   password).

3. **Customize scrapers and defaults** in `config/config.js`:
   - `sources` — which boards to scrape
   - `keywords` / `excludeKeywords` — seed values for the **default digest
     profile only** on first run; scraping always pulls full catalogs
   - `maxJobAgeDays` (42) — window for `npm run scrape:full`
   - `dailyMaxJobAgeDays` (2) — minimum window for daily runs

## Running the scraper

```bash
npm run dry          # scrape + match profiles, print counts, no DB writes or email
npm run dry:full     # same, but full backfill age window (42 days)
npm start            # daily run: scrape → save → match profiles → email due digests
npm run scrape:full  # backfill up to maxJobAgeDays (also sizes Playwright scrapers higher)
npm run scrape:catchup  # alias for npm start
```

**Daily age window:** on `npm start`, the scraper keeps jobs posted within N days,
where N is auto-sized from the last scrape time (min 2, max 42). Override with
`MAX_JOB_AGE_DAYS` in the environment.

Sources return mixed-age catalogs — only jobs inside the age window are saved.
Keyword filtering for email happens against hunt profiles, not at scrape time.

## Web app (board + preferences + resume tailoring)

```bash
cd web
npm install
cp .env.local.example .env.local
npm run dev          # http://localhost:3000
```

Or from the repo root: `npm run web:dev`.

**`.env.local` needs:**
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (same project as the scraper)
- `ANTHROPIC_API_KEY` — required for resume gap analysis and tailoring

1. **Browse** — all scraped jobs on the board (no sign-in required). Tabs:
   - **All jobs** — full catalog with sidebar filters
   - **Preferred** — jobs matching interest-area categories (sports, EV, analytics,
     etc.)
   - **Applied** — jobs you've marked applied (sign-in required)
2. **Sign in** — enter the email that receives your digest; sets a long-lived
   cookie (no password).
3. **Filters** — posted-within, min salary, location radius, remote/hybrid/onsite,
   interest categories, and text search. Sort by date or salary.
4. **Preferences** — `/settings/<edit_token>` (link printed on first subscriber
   creation, or from the header when signed in). Multiple **digest profiles** with
   their own keywords, exclusions, locations, remote-only, min salary, and email
   frequency (daily / every 3 days / weekly).
5. **Resume** — upload a master resume in settings; open any job to **tailor**
   a version with Claude (PDF/DOCX download).
6. **Manual jobs** — paste roles from outside the scrapers and tailor resumes
   for those too.

Listings stay on the board for **6 weeks** (`expires_at`), then expire
automatically. If the board exceeds 100,000 active jobs, oldest buckets are
pruned first. Hourly salaries are normalized to annual: `$15–20/hr` →
`$28,800–$38,400/yr` (40 hrs × 4 weeks × 12 months).

## Daily automation (GitHub Actions)

1. Push this repo to GitHub.
2. Repo → **Settings → Secrets and variables → Actions**:
   - **Secrets:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EMAIL_TO`,
     `RESEND_API_KEY`, and optionally `EMAIL_FROM`, `GMAIL_USER`,
     `GMAIL_APP_PASSWORD`, `USAJOBS_API_KEY`, `USAJOBS_USER_AGENT`
   - **Variables (optional):** `EMAIL_PROVIDER` (`resend` or `gmail`; defaults
     to `resend`)
3. `.github/workflows/daily.yml` runs every day at **15:00 UTC** (8:00 AM Pacific
   during daylight saving; 7:00 AM in standard time). GitHub crons are always UTC —
   edit that line to change the send time. You can also trigger a run manually from
   the **Actions** tab via **Run workflow**.

The workflow runs `npm ci`, installs Playwright Chromium, then `npm start` with
`SCRAPE_MODE=daily`.

## How dedupe works

**Job records:** each listing is upserted on `(source, external_id)`. The same
job scraped twice updates the existing row instead of creating a duplicate.
Within a single run, duplicate keys in the batch are merged (e.g. USAJobs
pagination overlap, or Remotive API + RSS + browser hitting the same ID). When
re-scraping, the longer description is kept.

**Email dedupe:** matching is per **digest profile**, not globally per job. When
a job matches a profile's keywords, location, salary, and exclusion rules, a row
is inserted into `profile_job_matches` (unique on `profile_id` + `job_id`). The
digest email pulls matches where `emailed_at` is null, sends one combined email
per subscriber for all profiles that are due, then sets `emailed_at` on those
rows. Re-running the scraper the same day will not re-send them.

**Digest timing:** each profile has a frequency (`daily`, `every_3_days`,
`weekly`). A profile is skipped until enough time has passed since
`last_sent_at`, even if new matches exist.
