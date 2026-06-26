# Job Hunter

Scrapes a bunch of job boards daily, filters by your keywords, dedupes against
everything you've already seen, and emails you a digest of the new matches.

## Sources

| Source | Method | Notes |
| --- | --- | --- |
| RemoteOK | Free API | |
| Remotive | Free API | |
| The Muse | Free API | |
| Arbeitnow | Free API | European + remote focus |
| We Work Remotely | RSS | |
| Hacker News "Who's Hiring" | Algolia API | New thread on the 1st of each month |
| USAJobs.gov | Official API | Needs a free API key |
| Dice | Playwright (headless browser) | Most fragile; disable in config if it breaks |

## Setup

1. **Install dependencies**

   ```bash
   npm install
   npx playwright install chromium   # only needed for the Dice scraper
   ```

2. **Environment variables** — copy `.env.example` to `.env` and fill in:
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard → apartment-hunt project →
     Project Settings → API Keys → `service_role`
   - `EMAIL_TO` — where the digest goes
   - `RESEND_API_KEY` — free account at [resend.com](https://resend.com).
     The default `onboarding@resend.dev` sender works without any domain setup,
     but can only send to the email you signed up with.
   - `USAJOBS_API_KEY` / `USAJOBS_USER_AGENT` — free key from
     [developer.usajobs.gov/apirequest](https://developer.usajobs.gov/apirequest/)
     (user agent is just your email address)

   To switch to Gmail later: set `EMAIL_PROVIDER=gmail` plus `GMAIL_USER` and
   `GMAIL_APP_PASSWORD` (an [app password](https://myaccount.google.com/apppasswords),
   not your real password).

3. **Customize your filters** in `config/config.js` — keywords, exclusions,
   max job age, and which sources to run. This is the only file you'll
   regularly touch.

## Running the scraper

```bash
npm run dry   # scrape + filter, print matches, touch nothing (great for testing)
npm start     # full run: scrape -> save to Supabase -> match profiles -> email digest
```

## Web app (dashboard + preferences)

```bash
cd web
cp .env.local.example .env.local   # add SUPABASE_SERVICE_ROLE_KEY
npm run dev                        # http://localhost:3000
```

1. Enter your email on the home page (creates a subscriber if new).
2. **Your board** — browse jobs with tabs: My matches, Not emailed yet, Past digests, All jobs. Sort by date, salary, company, or source.
3. **Edit preferences** — add multiple hunt profiles (sports, energy, etc.), each with its own keywords, frequency, location, and min salary.

Hourly salaries are normalized to annual: `$15–20/hr` → `$28,800–$38,400/yr` (40 hrs × 4 weeks × 12 months).

Jobs stay on the board for ~3 weeks, then expire automatically.

## Daily automation (GitHub Actions)

1. Push this repo to GitHub.
2. Repo → Settings → Secrets and variables → Actions → add these **secrets**:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EMAIL_TO`, `RESEND_API_KEY`,
   and `USAJOBS_API_KEY` / `USAJOBS_USER_AGENT` if you use USAJobs.
3. Done — `.github/workflows/daily.yml` runs every day at 7:00 AM Pacific.
   You can also trigger it manually from the **Actions** tab via "Run workflow".

## How dedupe works

Every job is saved to Supabase with a unique `(source, external_id)` key.
A job is only ever emailed once: the digest pulls rows where `sent_at` is null
and stamps them after sending. Re-running the script on the same day won't
re-send anything.
