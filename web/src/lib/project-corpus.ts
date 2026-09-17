/** Standing project briefs ingested from repo dumps. Markers keep later pastes from duplicating. */

export const DRAFTDNA_CONTEXT = `=== DRAFT DNA ===
Canonical name: Draft DNA (also DraftDNA). Public: https://draftdna.com. GitHub: github.com/TrevorFaust/DraftDNA. Resume title: NFL Data Platform (draftdna.com) — never add "Mock Draft Simulator" to the title. package.json name is leftover vite_react_shadcn_ts.
What it is: 2026-season fantasy football SPA for a personal big board, CPU/multiplayer mocks, player research, league tools, and a free Pick Six skill contest. Audience: people who rank and mock for their own league, not an NFL prospect-scouting product.
Status: production personal product (Vercel + hosted Supabase). README tells readers to use draftdna.com rather than cloning an empty shell. First commit 2025-12-03 from a Lovable Vite template; ~150 commits on main. No MAU, revenue, or prize-funding proof in git.
Runtime: TypeScript 5.8 / React 18.3 / Vite 5.4 SPA. No Next.js, Express, or Node app server. Production: npm run build → static dist/; vercel.json rewrites every path to index.html. Local: npm run dev on port 8080. Durable state is hosted Supabase Postgres + Auth + Realtime + five Deno Edge Functions (create-account, delete-user, verify-recaptcha, sync-player-teams, sync-nfl-scoreboard). Node version unpinned. Python is offline-only (ADP consensus, badge/PDF icons); openpyxl is imported but missing from requirements.txt. Optional pg_cron 0 11 * * * Sleeper team sync via pg_net; whether production enabled it is unknown. Pick'em scoreboard has no cron — any signed-in user can invoke sync-nfl-scoreboard.
Data: Postgres database named postgres is what the site reads. A second DB nfl_webapp is a working copy synced with pg_dump (manual). Core tables: players (2025+2026 rows merged in the client on espn_id), user_rankings, guest_rankings (excluded from consensus), baseline_community_rankings, mock_drafts/draft_picks, multiplayer_*, leagues/members/teams/keepers, user_season_predictions, nfl_games, pickem_picks, weekly_stats_*, newsletter_*. Client: @supabase/supabase-js. RLS on later migrations; public read on reference stats; auth.uid() and league membership on user data. No Redis, S3, Elasticsearch. Browser localStorage for guest boards/mocks/season predictions. React Query staleTime 5 min. PostgREST page size 1000. statement_timeout 60s for anon/authenticated. Generated types.ts lags newsletter tables.
Ingest: vendor ADP files in ADP Rankings/ → scripts/build-adp-consensus.py → match-adp-consensus.ts → public/adp-sources/*.json plus SQL baselines. nflverse GitHub CSVs for rosters/weekly stats/draft picks (upsert by gsis_id, dry-run unless APPLY_CHANGES=1, never deletes CUT/FA). Sleeper players API for team/jersey/sleeper_id. ESPN public scoreboard → nfl_games. Gemini (gemini-2.5-flash-image) is offline badge-icon generation only, not a runtime path. No Stripe, Sentry, PostHog, SendGrid SDK.
Domain: 18 format buckets (standard/PPR/half-PPR × redraft/dynasty × 1QB/superflex × rookies-only). Community ranks = baseline×100 + each signed-in user_rankings×1; guests no longer vote. Solo CPU is browser selectCpuPick (archetype nudge 0.22, starter-need force-fill, DST/K round gates, reach cap ceil(numTeams*1.05)). Multiplayer CPU is SQL mp_select_bpa_player + mp_team_needed_positions — not the JS archetype engine. Named archetypes in generated list = 100 (ignore stale "360" comment). Chaos triggers ~28. Draft grade v5 letters A+–F- (A+ ≥ 93, B ≥ 70); keepers value-neutral. Pick Six: exact-order top 6 per QB/RB/WR/TE/K/D/ST; partial credit 1, 1/2, 1/3, 1/4, 1/5, 1/6; identity espn_id or dst:<abbr>. Prize constants $6,000 / $36,000 are rules text, not a bank balance. Live Pick Six UI still aggregates 2025 half-PPR via get_player_2025_season_stats. Season Predictions lock 2026-09-12T00:00:00-04:00; cloud sync refuses empty-device overwrites. Team Rankings default 14 teams, weights must sum to 100, RB room breaks ties. Auth: email+password, JWT in localStorage, Edge create-account confirms email in-function because SMTP was unreliable. Password 10+ with complexity. reCAPTCHA v2 on first Pick Six rules accept.
Honesty — never invent: 200M records, 400+ badges, user counts, conversion, latency SLOs, funded/escrowed prizes, pg_cron actually enabled, email deliverability. Landing "1100+" players is labeled rough. html-to-image is an unused leftover dependency. Open lobby idle expiry is client-invoked RPC, not a guaranteed worker. Dual CPU engines (JS archetypes vs SQL BPA) is a known split.
Skills this project actually used: TypeScript, React 18, Vite, React Router, Tailwind, TanStack Query, dnd-kit, Zod, PostgreSQL, PL/pgSQL, RLS, Supabase Auth/Realtime, Deno Edge Functions, PostgREST, Sleeper/ESPN/nflverse ingest, contest scoring.`;

export const DRAFTDNA_PROJECT = {
  title: 'NFL Data Platform (draftdna.com)',
  locked: true,
  includeByDefault: true,
  bullets: [
    {
      text: 'Shipped Draft DNA (draftdna.com): a production Vite/React 18/TypeScript SPA on Vercel with Supabase Postgres, Auth, Realtime, and Deno Edge Functions for 2026 fantasy rankings, mocks, leagues, and contests.',
    },
    {
      text: 'Implemented community consensus as a weighted average: vendor baseline ranks count as 100 votes per player and each signed-in board counts as 1, so one user cannot swing ADP.',
    },
    {
      text: 'Built multiplayer mocks as Postgres-authoritative state: invite/open lobbies, pick-clock RPCs, SQL BPA autodraft, Realtime plus poll fallback, and 10-minute idle expiry.',
    },
  ],
};

export const SCOUTDNA_CONTEXT = `=== SCOUTDNA: ALL 32 ===
Canonical name: ScoutDNA: All 32. Parent brand: DraftDNA. GitHub: github.com/TrevorFaust/ScoutDNA_Newsletter.git (treat as private unless confirmed). Local: http://localhost:3000. Production web domain: unknown. Vercel intent from a Sept 2026 commit and .vercel gitignore; no vercel.json or custom domain in repo. Do not invent a production URL.
What it is: a fantasy-first NFL digest. Daily collect of Reddit RSS, ESPN RSS, YouTube captions, and podcast show notes into Postgres. Tuesday weekly Claude compose of a cited 32-team recap (optional daily). Human rumor and camp-battle review, then Next.js HTML publish. Email send is Phase 2 / not implemented. Twitter/X is deferred. Audience: people who draft skill players and still read beat notes (dynasty and redraft).
Status: personal editor loop, not multi-tenant SaaS. README: live for camp/preseason 2026. Eight commits on main (2026-06-26 → 2026-09-01) plus later uncommitted pipeline/web work. DraftDNA is a sibling Vite app on the same Supabase project; it is not a second product in that newsletter repo.
Runtime: Python 3.12 jobs on Windows Task Scheduler (1am collect / 3am nflverse PT) and GitHub Actions ubuntu-latest as backup (collect timeout 480 min; nflverse 180). Next.js 15.5 / React 19 App Router against Supabase HTTP. Compose and camp extract: Anthropic (ANTHROPIC_MODEL default claude-sonnet-4-6). No Docker, Terraform, Redis, Kubernetes, or test suite. Media: ThreadPoolExecutor, default 6 workers; Actions set YOUTUBE_SKIP_WHISPER=true (captions only). Timezone America/Los_Angeles.
Data: shared DraftDNA Postgres (docs nickname paveh). Newsletter-owned tables newsletter_* + camp_* + fantasy_position_battles + rosters_2026 / usage / team_week_results. Reads DraftDNA fantasy_team_depth, players, rookies_2026, nfl_team_context_2025. Do not run standalone migrations 001–003 on paveh (public.teams collision). Raw items unique (url_hash, content_date). Issue status: collecting → published. Service role writes; RLS lets anon SELECT published issues. No user-id mapping; approved_by is the string "admin". Admin APIs have no login. PostgREST page size 1000; nflverse upserts 500. No object storage.
Pipeline: collect.yml cron 0 8 * * *; sync_nflverse.yml cron 0 10 * * * (Tuesday also run_compose_weekly). Fuzzy cluster thefuzz.token_sort_ratio >= 72. Camp scoring is deterministic after LLM extract; proposals never mutate battles until an approve API + audit log. Duplicate-story collapse (thefuzz >= 78) keeps 0.2 weight on reprints. Usage flags from nflverse/ESPN shares (RB lead split ~45/25, WR ~22% or gap ≤8, TE ~18%).
Honesty: no MAU, subscribers, open rate, Anthropic spend, or uptime in-repo. Do not claim daily 32-team Sonnet compose as the default. Do not claim email or Resend is live. Do not auto-settle WR2. Talk section is removed in code. newsletter_story_clusters exists; compose currently clusters in memory.
Skills this project actually used: Python 3.12, Next.js 15, React 19, TypeScript, Supabase Postgres, SQL migrations, Anthropic Claude, httpx, feedparser, thefuzz, pyarrow/nflverse, yt-dlp, GitHub Actions, Windows Task Scheduler, PowerShell, ESPN RSS/API, Reddit RSS.`;

export const SCOUTDNA_PROJECT = {
  title: 'ScoutDNA: All 32',
  locked: false,
  includeByDefault: false,
  bullets: [
    {
      text: 'Built a 32-team NFL digest that collects Reddit, ESPN RSS, YouTube, and podcasts into Postgres, then composes a cited weekly recap with Anthropic Claude after a Tuesday usage sync.',
    },
    {
      text: 'Integrated with an existing DraftDNA database using newsletter_* tables so collect/compose does not collide with public.teams, while still reading depth, players, and usage.',
    },
    {
      text: 'Shipped a camp-signal queue: Claude extracts up/down mentions, code scores a 7-day window with reprint collapse, and battles only change after an approve API writes an audit row.',
    },
  ],
};

export const APARTMENT_HUNT_CONTEXT = `=== APARTMENT HUNT ===
Personal once-daily rental pipeline. No public product URL. GitHub: github.com/TrevorFaust/apartment-hunt (treat as private unless confirmed). UI title "The Apartment Hunt"; email "Daily Apartment Digest".
What it is: scrape several city rental sites, upsert into Supabase Postgres, email new matches via Resend, browse/filter/favorite/hide in a local Next.js app.
Status: personal, active local development. README: once daily, low volume, personal use. GitHub Actions cron exists. Web has next start but no Vercel/Docker/Fly config. Do not claim a production web host.
Runtime: Node 22 TypeScript npm workspaces (scraper + web). Scraper: tsx + Playwright 1.60 + cheerio. Web: Next.js 16 App Router, React 19, Tailwind 4, Server Actions, force-dynamic. CI: ubuntu-latest, npm ci, headed Chrome under Xvfb, cron 0 15 * * * (15:00 UTC), 20-minute timeout. Email: Resend from onboarding@resend.dev. Geocode: OpenStreetMap Nominatim (no key, User-Agent ApartmentHunt/1.0), 120 calls/run, ~1.1s throttle.
Data: public.listings (upsert on source, external_id; preserves first_seen_at, is_favorite, is_hidden), public.preferences (singleton key=default, locations jsonb, radius columns), public.scrape_runs (append-only). No users table, no app auth. Both scraper and Next use SUPABASE_SERVICE_ROLE_KEY. Original CREATE TABLE is not in git; later ALTER is supabase/migrations/20260701000000_locations_geocoding_radius.sql.
Sources: Craigslist + Apartments.com for every location. SeattleRentals if city=seattle. ChicagoRentals (WP REST), ChicagoApartmentFinders (RealtyMX POST), UrbanAbodes, Domu if chicago/il. Chicago adapters, Nominatim geocoding, haversine radius, and neighborhood city:name facets are working-tree (not on the 3-commit origin/master). Do not imply they are already pushed unless the JD only needs the capability.
Matching: no score. New = never-seen (source, external_id), not posted_at today. Newsletter is boolean AND of configured prefs; neighborhoods and keywords are OR. Missing numeric fields usually pass; a set radius drops listings without coordinates. Same physical unit on two sites is two rows. is_active is written true and never used as a browse filter.
UI: / listings (tabs All / New 24h / Favorites / Hidden, page size 50, radius path may load 10k rows then haversine in Node), /preferences. Browse filters are independent of saved scrape prefs except city centers for optional radius.
Honesty: no user metrics, no email open rate, no public deploy. Service-role-in-Next is a personal-app shortcut, not a security talking point. README "no email on day one" is not implemented in code.
Skills this project actually used: TypeScript, Node.js, Playwright, cheerio, Supabase Postgres, PostgREST, GitHub Actions, Resend, Nominatim, Next.js App Router, React 19, Server Actions, Tailwind 4, HTML email, haversine geo.`;

export const APARTMENT_HUNT_PROJECT = {
  title: 'Apartment Hunt',
  locked: false,
  includeByDefault: false,
  bullets: [
    {
      text: 'Built a personal TypeScript pipeline that scrapes rental sites once daily, upserts into Supabase Postgres, and emails a new-listings digest via Resend.',
    },
    {
      text: 'Scheduled the scrape on GitHub Actions with headed Chrome under Xvfb so Apartments.com bot checks do not fail the run.',
    },
    {
      text: 'Added a Next.js 16 board to browse, filter, favorite, and hide listings using Server Actions against the same Postgres tables.',
    },
  ],
};

export const FANTASY_BLOG_CONTEXT = `=== FANTASY LEAGUE BLOG ===
Canonical: npm/GitHub/Vercel project fantasy-league-blog. In-app name Practice Squad Rankings (src/content/site.json). README: Fantasy League Blog (Practice Squad Rankings). Unused JSON label portfolioLabel = "Fantasy League Blog". Public: https://fantasy-league-blog.vercel.app. GitHub: github.com/TrevorFaust/fantasy-league-blog (public). Legacy Wix still referenced: trevorfaus27.wixsite.com/seattle-seacocks-pra. Images: static.wixstatic.com. Custom domain: unknown (not in source; only the Vercel default on the GitHub homepage field).
What it is: a Next.js archive of commissioner-written fantasy football power rankings for one Seattle 12-team league, rebuilt off Wix so league-mates can browse seasons, recaps, and ranked writeups. Rankings are editorial prose, not a scoring engine. Audience: that league, not a multi-tenant product.
Status: personal production. package.json private 0.1.0. No analytics, auth, or CMS. First commits 2026-09-10: fe6cb63 Wix migrate, ac54ee9 Wix CDN images, f973624 .vercelignore scrape (current HEAD / origin/main). GitHub createdAt 2026-09-11. Working tree (uncommitted): magazine restyle, ranking parser, photo-crop editor, public/covers/2025-recap.png (2026-09-16). Live Vercel is the Sep 10 card layout unless a later deploy happened outside git.
Runtime: Next.js 16.3.4 App Router, React 19.2.8, TypeScript strict target ES2017, Tailwind 4.3.3. Node >= 20.9.0 (Next lockfile). Local: next dev (working-tree script uses --port 3010). Production: Vercel next build. No Docker, workers, queues, cron, process.env reads, LLM, or database. Playwright 1.63 is scrape-only (listed in dependencies). Fonts: committed Bebas Neue + DM Sans; working tree Playfair Display + Source Serif 4.
Data: src/content/site.json is the source of truth. 23 posts stored twice (seasons + top-level posts): 2023 15, 2024 4, 2025 4. generateStaticParams years hardcoded ["2023","2024","2025"]. 76 unique live image URLs, 329 refs, ~656k chars of body text, 630 blocks. photo-crops.json has 3 keys. Browser localStorage: psq-safe-mode, psq-photo-crops. One untracked object: public/covers/2025-recap.png. scrape/ is gitignored (26 sitemap pages, 101 originals).
Ingest: scripts/scrape-wix.mjs Playwright BFS from 26 Wix seeds, chrome strip, 200-char block dedupe, /v1/ image dedupe, 50k bodyText cap, 60s goto + 2500ms wait, no retry. scripts/build-content.mjs hardcoded Wix-URL → {season,slug,title,order} because Copy of … paths do not match titles (2025 post-draft from copy-of-2024-post-draft-rankings-1; 2023 week N from copy-of-week-(N-1); 2023 post-draft is Wix /week-1). Manual npm run scrape && npm run content; no GitHub Actions.
Parser (working tree, not origin/main): parsePost walks blocks; first line /^(\\d{1,2})\\s*[\\.:]\\s*(.*)$/ starts a RankEntry; stats if Post Draft Ranking|Post Draft Change|Quarterly Change|Weekly Change|Record; else body. 2024 often uses Post Draft Rank: which will not become stats. 15 PEOPLE keys + TEAM_ALIASES; assignImages skips a short-alt lead image then 6-char prefix overlap, leftovers in order. rankingPhotoFit: matte and brendan object-contain, else cover. Zero-width/NBSP stripped. 2023 "7: Team Bekah" body duplicates Trevor's writeup (Wix content bug).
API: GET/POST /api/photo-crops writes src/content/photo-crops.json, no auth, clamp x/y 0–100 scale 1–2.4, 500ms debounce. File writes will not survive Vercel serverless; localStorage still works. Safe mode is client regex (10 swear families + Seacocks → Sea*****); ?safe=1; footer in layout.tsx is not filtered.
Honesty — never invent: MAUs, custom domain, Sleeper/ESPN APIs, ranking math, product revenue ($225/$50 is 2025 prize copy in a post), tests/CI, that the magazine UI / parser / crop editor are deployed. Crop POST is an unauthenticated write if that route is live. Duplicate season/post indexes. Playwright unused at serve time.
Skills this project actually used: TypeScript, React 19, Next.js 16 App Router, Tailwind 4, Playwright, JSON content modeling, regex parsing, heuristic person/photo matching, next/image remotePatterns, Vercel, GitHub.`;

export const FANTASY_BLOG_PROJECT = {
  title: 'Practice Squad Rankings (fantasy-league-blog.vercel.app)',
  locked: false,
  includeByDefault: false,
  bullets: [
    {
      text: 'Migrated a Wix fantasy-league blog to a Next.js 16 / React 19 site with statically generated season and post routes for 23 recaps across 2023–2025.',
    },
    {
      text: 'Built a Playwright crawler and content compiler that remaps Wix “Copy of …” URLs onto clean /[year]/[slug] routes and emits a typed site.json source of truth.',
    },
    {
      text: 'Replaced git-hosted images with Wix CDN URLs after a cover PNG exceeded 8 MB, cutting deploy payload while keeping next/image remotePatterns locked to static.wixstatic.com.',
    },
  ],
};

export const PERSONAL_WEBSITE_CONTEXT = `=== PERSONAL WEBSITE ===
Canonical: Trevor Faust Portfolio. Public: https://trevorfaust.github.io. GitHub: github.com/TrevorFaust/TrevorFaust.github.io (user Pages repo, served at domain root, not /{repo}). package.json name trevorfaust-github-io 0.0.1. Document/OG title: Trevor Faust — Data Analytics & Product Building.
What it is: static one-page personal site for a Seattle data professional. Audience: recruiters and hiring managers for data-analytics roles in sports or technology, plus anyone who wants project/about/contact links.
Status: personal production on GitHub Pages, deploy on every push to main. Two commits on 2026-09-10; HEAD is 00d1d1a. Uncommitted working-tree work: astro:assets portraits, contact-card UX, project order/tags. Local dist/ can lag source. Do not treat HEAD placeholders as the current laptop UI, and do not claim portraits are live in production until that commit deploys.
Scope rule: this repo is the portfolio only. DraftDNA, ScoutDNA, Job Search, Apartment Hunt, and Fantasy League Blog appear as copy and outbound links in src/data/site.ts. Their stacks, metrics, and pipelines are not implemented here. "200M+ NFL records", "150-source pipeline", "32 NFL clubs", "$2M in production savings", and "500+ product datasets" are catalog/bio copy, not evidence from this codebase.
Runtime: TypeScript / Astro 7.3.2 SSG, Node >=22.12.0, no adapter (static files). Local: npm run dev → astro dev. Production: GitHub Actions ubuntu-latest, Node 22 (not pinned to 22.12), npm ci, astro build, upload-pages-artifact, deploy-pages. No Docker, workers, queues, cron, database, env vars in source, SSR, React/Vue islands, or LLM SDK. public/.nojekyll is required so Pages Jekyll does not drop Astro's _astro/ hashed assets.
Data: typed module src/data/site.ts (site, projects[5], about). Five project cards; three featured (DraftDNA, ScoutDNA, Fantasy League Blog). Eight skill chips. Contact: email, LinkedIn, Substack, GitHub. Working-tree portraits in src/assets/ via astro:assets Image widths 360/540/720. Google Fonts Fraunces + Figtree (not self-hosted). Sitemap for one URL: /.
UI rules: featured true → badge; href contains github.com → "View repo", else "Open live"; extra GitHub link if repo !== href. Reveal: IntersectionObserver on .reveal, threshold 0.15, rootMargin 0px 0px -8% 0px, unobserve after first paint. Primary nav section links hidden below 768px. Footer year is build-time getFullYear().
Honesty: no tests, no analytics, no og:image, no pageviews, no Lighthouse proof. Do not list Python, Supabase, Playwright, Next.js, or Anthropic as skills from this repo. Do not invent a Node server in production.
Skills this project actually used: TypeScript, Astro 7, HTML, CSS, Vite, GitHub Pages, GitHub Actions, astro:assets/Sharp, XML sitemap, Open Graph meta, skip link / reduced-motion.`;

export const PERSONAL_WEBSITE_PROJECT = {
  title: 'Trevor Faust Portfolio (trevorfaust.github.io)',
  locked: false,
  includeByDefault: false,
  bullets: [
    {
      text: 'Shipped a public one-page portfolio at trevorfaust.github.io as a static Astro 7 TypeScript site on GitHub Pages.',
    },
    {
      text: 'Kept project copy, tags, and contact URLs in a typed src/data/site.ts module so updates are data changes rather than layout rewrites.',
    },
    {
      text: 'Published on every push to main with GitHub Actions (npm ci, astro build, Pages artifact deploy) and public/.nojekyll so hashed _astro assets are not dropped by Jekyll.',
    },
  ],
};

const STALE_DRAFTDNA = /200M|400\+\s*draft badges/i;

export function isDraftDnaProjectTitle(title: string): boolean {
  return /draftdna|draft dna|nfl data platform/i.test(title);
}

export function isFantasyBlogProjectTitle(title: string): boolean {
  return /fantasy league blog|practice squad|fantasy-league-blog/i.test(title);
}

/** Replace invented DraftDNA metrics; do not add a second DraftDNA project. */
export function mergeSeedProjects<T extends { title: string; bullets: Array<{ text: string }> }>(
  existing: T[],
  seed: T[]
): T[] {
  const next = existing.map((project) => {
    if (!isDraftDnaProjectTitle(project.title)) return project;
    const blob = project.bullets.map((b) => b.text).join('\n');
    if (!STALE_DRAFTDNA.test(blob)) return project;
    const replacement = seed.find((p) => isDraftDnaProjectTitle(p.title));
    return replacement ? { ...project, ...replacement } : project;
  });
  const haveTitles = new Set(next.map((p) => p.title.trim().toLowerCase()));
  const hasDraftDna = next.some((p) => isDraftDnaProjectTitle(p.title));
  const hasFantasyBlog = next.some((p) => isFantasyBlogProjectTitle(p.title));
  for (const project of seed) {
    if (!project.title.trim()) continue;
    if (isDraftDnaProjectTitle(project.title) && hasDraftDna) continue;
    if (isFantasyBlogProjectTitle(project.title) && hasFantasyBlog) continue;
    if (haveTitles.has(project.title.trim().toLowerCase())) continue;
    next.push(project);
    haveTitles.add(project.title.trim().toLowerCase());
  }
  return next;
}

function splitMarkedBlocks(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const chunks = trimmed.split(/(?=^=== [^=\n]+ ===\s*$)/m).map((s) => s.trim()).filter(Boolean);
  return chunks.length ? chunks : [trimmed];
}

function blockMarker(block: string): string | null {
  const match = block.match(/^=== [^=\n]+ ===/);
  return match ? match[0] : null;
}

export function mergeProjectContextNotes(existing: string, seed: string): string {
  const current = existing.trim();
  const additions = splitMarkedBlocks(seed);
  if (!additions.length) return current;
  if (!current) return additions.join('\n\n');

  let next = current;
  for (const block of additions) {
    const marker = blockMarker(block);
    if (marker ? next.includes(marker) : next.includes(block.slice(0, 80))) continue;
    next = `${next}\n\n${block}`;
  }
  return next;
}
