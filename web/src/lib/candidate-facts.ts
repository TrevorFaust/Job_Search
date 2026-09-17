export type CandidateFact = {
  id: string;
  /** Distinctive phrases; a question matches when enough of these appear. */
  triggers: string[];
  minHits: number;
  answer: string;
};

/**
 * First-person notes for systems Trevor built (this repo and related projects).
 * Matched clarifying questions get this text prefilled so he can review instead of recalling internals.
 */
export const CANDIDATE_FACTS: CandidateFact[] = [
  {
    id: 'draftdna-runtime',
    triggers: [
      'draftdna',
      'draft dna',
      'nfl data platform',
      'what does this run on',
      'architecture',
      'vercel',
      'vite',
    ],
    minHits: 2,
    answer:
      'I ship Draft DNA as a static React 18 / Vite SPA on Vercel. There is no Node app server and it is not Next.js. vercel.json sends every path to index.html, so React Router owns URLs. Supabase hosts Postgres, Auth, Realtime, and Deno Edge Functions (signup, delete-user, reCAPTCHA, Sleeper team sync, ESPN scoreboard). Locally I run npm run dev on port 8080 against the same project. Solo draft intelligence is in the browser; multiplayer authority is SQL.',
  },
  {
    id: 'draftdna-cpu',
    triggers: [
      'draftdna',
      'draft dna',
      'cpu',
      'mock draft',
      'selectcpupick',
      'archetype',
      'how does scoring',
    ],
    minHits: 2,
    answer:
      'Solo CPUs get a named 5-axis archetype from a generated catalog of 100 badges. Each pick scores players near the current ADP slot, nudges positional weights by 22%, then slams scores if the pick reaches more than about a round past BPA (ceil(numTeams * 1.05)). Late in the draft, unfilled starters override flavor. Kickers wait until the last round; DST is gated by earliest round. Multiplayer CPUs do not use that JS; they walk the stored board array in Postgres and fill starter holes with mp_select_bpa_player.',
  },
  {
    id: 'draftdna-community',
    triggers: [
      'draftdna',
      'draft dna',
      'community ranking',
      'community ranks',
      'consensus',
      'baseline',
      'get_community_rankings',
    ],
    minHits: 2,
    answer:
      'Each of the 18 format buckets has a baseline_community_rankings list from vendor ADP. get_community_rankings unions those ranks at weight 100 with signed-in user_rankings at weight 1, then averages. Guests no longer vote. Rookie boards use a separate RPC. That is why the consensus board is stable — one user cannot swing ADP.',
  },
  {
    id: 'draftdna-storage',
    triggers: [
      'draftdna',
      'draft dna',
      'how is data stored',
      'postgres',
      'nfl_webapp',
      'user_rankings',
      'localstorage',
    ],
    minHits: 2,
    answer:
      'Canonical rows live in Supabase Postgres. players has season 2025 and 2026 rows that I merge on espn_id. User boards, mocks, Pick Six, pick\'em, and leagues are tables with RLS. Guests stay in localStorage until sign-in, then I migrate. I also keep a working DB named nfl_webapp and dump it into postgres when I want the site to see schema experiments. There is no Redis or S3 in this product.',
  },
  {
    id: 'draftdna-users',
    triggers: [
      'draftdna',
      'draft dna',
      'other people',
      'used by anyone',
      'mau',
      'production site',
      'user counts',
    ],
    minHits: 2,
    answer:
      'The public site is draftdna.com and the README treats it as production. The repo has no user counts, analytics, or contest-entry totals, so I cannot quote MAU. Pick Six has official rules, void states, and prize constants of $6,000 / $36,000; I cannot prove from git that prizes were funded or paid.',
  },
  {
    id: 'draftdna-pick-six',
    triggers: [
      'draftdna',
      'pick six',
      'prediction-challenge',
      'partial credit',
      'espn_id',
      'jackpot',
    ],
    minHits: 2,
    answer:
      'You rank the top 6 at each of QB/RB/WR/TE/K/D/ST. Exact slot = 1 point; one off = 0.5; two off = 1/3; down to five off = 1/6; miss the top 6 = 0. Identity is ESPN id, or team abbr for defenses, so 2025 vs 2026 UUIDs still match. Perfect order wins a $6,000 jackpot per position in the rules; those figures are code constants, not a bank balance. Live UI currently aggregates 2025 half-PPR until a 2026 stats RPC exists.',
  },
  {
    id: 'draftdna-multiplayer',
    triggers: [
      'draftdna',
      'draft dna',
      'multiplayer',
      'live draft',
      'pick clock',
      'open lobby',
      'mp_tick_draft',
      'autodraft',
    ],
    minHits: 2,
    answer:
      'The client is not trusted for the clock. mp_tick_draft / mp_make_pick run in Postgres. Realtime pushes picks; a poll covers missed DELETE/kick events. I had to set replica identity so kicks propagate, and stop refresh storms from resetting the 1-second timer. Autodraft fills starter holes rather than BPA-stacking defenses. Open lobbies expire after 10+ minutes idle, but that RPC is client-invoked, not a guaranteed worker.',
  },
  {
    id: 'draftdna-llm',
    triggers: [
      'draftdna',
      'draft dna',
      'gemini',
      'openai',
      'any llm',
      'badge icon',
      'generate_icons',
    ],
    minHits: 2,
    answer:
      'No LLM in the production request path. Gemini only generated badge icons offline (generate_icons.py). Archetype names and flavor text come from CSV via generateArchetypeLogic.mjs, then Pillow composites deterministic PNGs. There is no OpenAI or Anthropic SDK in the SPA.',
  },
  {
    id: 'draftdna-hardest',
    triggers: [
      'draftdna',
      'draft dna',
      'hardest',
      'multiplayer',
      'clock',
      'realtime',
      'refresh storms',
    ],
    minHits: 2,
    answer:
      'Live multiplayer was the hard one. A snake draft is a distributed clock: missed ticks, tab backgrounding, host disconnects, and Realtime DROP events that omit columns. Early on, refresh storms cancelled the 1-second timer. I moved authority into mp_tick_draft / mp_make_pick, healed deadlines in SQL, set replica identity so kicks propagate, and added poll backups in the lobby and chat. The JS CPU and SQL BPA still diverge, which is a known split, not a solved one.',
  },
  {
    id: 'draftdna-scale',
    triggers: [
      'draftdna',
      'draft dna',
      'scale it',
      'would you redo',
      'what would you not',
      'statement_timeout',
      '2026 stats',
    ],
    minHits: 2,
    answer:
      'Vertical scale on this architecture is more Postgres and a bigger SPA cache, which is fine for a personal production site. I would add a 2026 weekly-stats RPC so Pick Six does not sit on 2025 aggregates, cron the scoreboard so pick\'em does not depend on a user opening the page, and put CI on tsc plus a handful of pure functions. I would not introduce Kafka, microservices, or Next.js SSR. I would not run the rich JS CPU in the client for money drafts, and I would not let guests vote consensus again. I would unify the solo JS engine and the multiplayer SQL BPA into one draft engine.',
  },
  {
    id: 'job-board-fit-scoring',
    triggers: [
      'job board',
      'scoring logic',
      'scoring mechanism',
      'fit scoring',
      'fit score',
      'rate fit',
      'rule-based',
      'rule based',
      'anyone other than you',
      'used by anyone',
    ],
    minHits: 2,
    answer:
      'Nobody else uses it; it is a personal Next.js job-hunt board. Listing scores are rule-based TypeScript, not an LLM prompt asking for a 1-10 rating. For jobs I have not tailored yet, fit is a 0-10 estimate from JD vs experience-corpus keyword overlap, title-token overlap, seniority gap (IC vs manager/director/VP), years-required vs resume dates, and hard caps so exec roles cannot be inflated by domain keywords. After I tailor a resume, that session\'s gap-analysis score replaces the estimate. Bands: 7.5+ strong, 5.5+ moderate, 3.5+ stretch, else long shot.',
  },
  {
    id: 'apartment-hunt-runtime',
    triggers: [
      'apartment hunt',
      'apartment listing',
      'rental site',
      'what does this run on',
      'github actions',
      'headed chrome',
      'xvfb',
    ],
    minHits: 2,
    answer:
      'Apartment Hunt is a Node 22 TypeScript monorepo: a tsx/Playwright scraper and a Next.js 16 UI, both talking to a Supabase Postgres project with the service-role key. The scrape is meant to live on GitHub Actions (ubuntu-latest, npm ci, headed Chrome under Xvfb, cron 0 15 * * *, 20-minute timeout). Email is Resend from onboarding@resend.dev. The web app is documented as local next dev; there is no Vercel, Docker, or Fly file in the repo, so I do not claim a production web host.',
  },
  {
    id: 'apartment-hunt-scoring',
    triggers: [
      'apartment hunt',
      'listing score',
      'how does scoring',
      'matches preferences',
      'new listings',
      'boolean match',
      'radius filter',
    ],
    minHits: 2,
    answer:
      'There is no score. A listing is either new, meaning I have never stored that (source, external_id), or not. The newsletter keeps it if it passes boolean prefs: price, beds, baths, sqft, optional neighborhood OR-list, optional keyword OR-list on title and amenities, optional haversine radius. If a numeric field is missing, that constraint usually passes. If I set a radius, missing lat/lng fails. Re-scrapes update last_seen_at and are not emailed again.',
  },
  {
    id: 'apartment-hunt-storage',
    triggers: [
      'apartment hunt',
      'how is data stored',
      'listings table',
      'preferences row',
      'scrape_runs',
      'natural key',
      'upsert',
    ],
    minHits: 2,
    answer:
      'One listings row per site-native id, upserted in chunks of 200 on (source, external_id). Preferences are a singleton key=default with a locations jsonb array. Each scrape appends scrape_runs with source_counts, new_listing_count, email_sent, and error. I talk to Postgres only through the Supabase service-role client. Original CREATE TABLE is not in git; later lat/lng/state/locations columns live in supabase/migrations/20260701000000_locations_geocoding_radius.sql.',
  },
  {
    id: 'apartment-hunt-users',
    triggers: [
      'apartment hunt',
      'other people',
      'multi user',
      'multi-user',
      'personal use',
      'roommates',
      'anyone else',
    ],
    minHits: 2,
    answer:
      'The README says personal use, once daily, be kind to the sites. There is no login, no users table, and one preferences row. Favorite and hidden flags live on listing rows, not per user. I cannot prove other users from the repo, and I would not expose the service-role Next app on the public internet.',
  },
  {
    id: 'apartment-hunt-bot-detection',
    triggers: [
      'apartment hunt',
      'apartments.com',
      'akamai',
      'bot detection',
      'access denied',
      'headless',
      'headed chrome',
    ],
    minHits: 2,
    answer:
      'Apartments.com has no API, and Akamai intermittently serves Access Denied to automation, especially bundled headless Chromium. I launch the real Chrome channel when it is installed, set a desktop UA and viewport, retry once after 30 seconds if the title is Access Denied, and on GitHub Actions run headed under Xvfb. If that source still dies, sourceCounts is -1 and Craigslist and the other adapters still run.',
  },
  {
    id: 'apartment-hunt-add-city',
    triggers: [
      'apartment hunt',
      'add a city',
      'new city',
      'seattle rentals',
      'chicago',
      'buildsources',
      'source adapter',
    ],
    minHits: 2,
    answer:
      'Preferences already store many {city, state} locations. Craigslist and Apartments.com run for every location. SeattleRentals only if the city is seattle; the four Chicago adapters only if chicago/il. Adding a city is save on /preferences, which geocodes downtown if a radius is set, then scrape. A brand-new board needs a new adapter in scraper/src/sources and a buildSources branch. Chicago adapters are in the working tree, not the three commits on master.',
  },
  {
    id: 'apartment-hunt-dedupe',
    triggers: [
      'apartment hunt',
      'dedupe',
      'dedup',
      'external_id',
      'same apartment',
      'natural key',
      'first_seen',
    ],
    minHits: 2,
    answer:
      'Identity is the site-native id, not the address. Same physical unit on Craigslist and Apartments.com is two rows. In a run I collapse dupes in a Map keyed source:externalId, then upsert. Re-scrape of the same pid updates last_seen_at and keeps first_seen_at, favorites, and hidden flags. New for the newsletter means that key was not in the table before this run, not posted_at today.',
  },
  {
    id: 'apartment-hunt-auth',
    triggers: [
      'apartment hunt',
      'service role',
      'no login',
      'row level',
      'rls',
      'authentication',
      'public internet',
    ],
    minHits: 2,
    answer:
      'There is no app auth. The Next server uses SUPABASE_SERVICE_ROLE_KEY with persistSession false, which bypasses RLS. Anyone who can hit the UI can save prefs, favorite, and hide. That is fine for a private personal app. I would not ship that pattern as a public product without a user model and least-privilege keys.',
  },
  {
    id: 'apartment-hunt-hardest-problem',
    triggers: [
      'apartment hunt',
      'hardest',
      'bot gated',
      'akamai',
      'heterogeneous',
      'playwright',
      'cheerio',
    ],
    minHits: 2,
    answer:
      'The hard problem is that the target sites are not APIs, and Apartments.com is actively hostile to bots. I use real Chrome, a desktop fingerprint, one retry, and headed Xvfb on CI, then isolate adapters so one blocked site cannot kill the digest. The secondary problem is heterogeneous HTML: Craigslist gallery vs static markup, Apartments.com placards vs bedRentBoxes, RealtyMX POST offsets, UrbanAbodes client render, Domu map cards. Neighborhood strings are canonicalized to city:name tokens so Seattle Uptown and Chicago Uptown do not collapse.',
  },
  {
    id: 'scoutdna-runtime',
    triggers: [
      'scoutdna',
      'scout dna',
      'all 32',
      'what does this run on',
      'github actions',
      'task scheduler',
      'anthropic',
    ],
    minHits: 2,
    answer:
      'The site is Next.js 15 and React 19 talking to Supabase Postgres. Generation is Python 3.12: GitHub Actions on Ubuntu and/or Task Scheduler on my Windows machine at 1am and 3am Pacific. Anthropic is compose and camp extract. Media uses yt-dlp; Actions skip Whisper. There is no container, no Redis, no worker queue product. Vercel is the intended web host from a September 2026 commit, but the production URL is not in the repo.',
  },
  {
    id: 'scoutdna-scoring',
    triggers: [
      'scoutdna',
      'scout dna',
      'all 32',
      'how does scoring',
      'camp signal',
      'settle',
      'usage flag',
    ],
    minHits: 2,
    answer:
      'Two scorers: usage shares from nflverse/ESPN with deterministic committee flags, and camp momentum as signed strength times source tier times signal type, with reprints collapsed. Settle needs leader at least 8, gap at least 5, and quality evidence. The model does not flip WR2; I approve in /admin/camp-signals. PRE leftover shares are not a depth chart.',
  },
  {
    id: 'scoutdna-storage',
    triggers: [
      'scoutdna',
      'scout dna',
      'all 32',
      'how is data stored',
      'newsletter_',
      'url_hash',
      'paveh',
    ],
    minHits: 2,
    answer:
      'One Postgres, shared with DraftDNA. Raw items are keyed by URL hash plus content date. Issues and sections hold markdown plus footnote JSON. Context tables are season-scoped: rosters_2026, battles, usage. Service role writes; RLS lets anon read published issues. Standalone migrations 001 through 003 must not run on the shared project because public.teams already exists.',
  },
  {
    id: 'scoutdna-users',
    triggers: [
      'scoutdna',
      'scout dna',
      'all 32',
      'other people',
      'subscribers',
      'email send',
      'multi-tenant',
    ],
    minHits: 2,
    answer:
      'The repo is a personal editor loop plus a public-looking site and a signup table. Email send is not implemented. I cannot claim subscribers or readers from this codebase. Admin routes are public URLs with no login, so I would not treat a Vercel deploy with the service role as a multi-user product.',
  },
  {
    id: 'scoutdna-draftdna',
    triggers: [
      'scoutdna',
      'scout dna',
      'sibling',
      'shared schema',
      'public.teams',
      'newsletter_*',
      'paveh',
    ],
    minHits: 2,
    answer:
      'DraftDNA is a sibling Vite app on the same Supabase project. This newsletter reads depth, stats, and players from that schema and writes newsletter_* tables so we do not overwrite public.teams. I do not dump DraftDNA as a second product out of the ScoutDNA repo; they share Postgres, they are not one codebase.',
  },
  {
    id: 'scoutdna-daily-weekly',
    triggers: [
      'scoutdna',
      'scout dna',
      'all 32',
      'daily vs weekly',
      'tuesday',
      'weekly-first',
      'monday night',
    ],
    minHits: 2,
    answer:
      'Collect runs every day. Full 32-team Claude compose is Tuesday after the 3am usage sync unless I force a daily edition. That was a cost and quality choice: one recap with Thursday through Monday Night Football in it, instead of 32 Sonnet sections every morning.',
  },
  {
    id: 'scoutdna-hallucination',
    triggers: [
      'scoutdna',
      'scout dna',
      'all 32',
      'inventing stats',
      'hallucin',
      'compose context',
      'sanitizer',
    ],
    minHits: 2,
    answer:
      'Compose context is JSON from the database; the prompt says cite only those numbers. PRE leftover shares are not a depth chart. Sanitizers strip dashes and bad position tags. Review still exists because rumor flags and JSON parse errors happen. Depth labels in copy have to match the curated battles table.',
  },
  {
    id: 'scoutdna-hardest',
    triggers: [
      'scoutdna',
      'scout dna',
      'all 32',
      'hardest',
      'reprint',
      'syndication',
      'concepcion',
    ],
    minHits: 2,
    answer:
      'Camp scores treated RSS reprints of the same quote as five independent confirmations. Separate articles all predicting a WR1 looked like beat evidence. I split observed vs projection, capped projection strength in code not just the prompt, and fuzzy-deduped summaries so signal_count is unique stories. Related: PostgREST silently capping at 1000 rows, which would drop weekly items or roster chips, and last-name collisions across teams in generated prose.',
  },
  {
    id: 'scoutdna-auth',
    triggers: [
      'scoutdna',
      'scout dna',
      'all 32',
      'admin',
      'unauthenticated',
      'service role',
      'no login',
    ],
    minHits: 2,
    answer:
      'There is no login and no middleware. Admin routes and publish, rumor, and camp APIs are callable without a session. Mutations use the service role if it is set on the server. Docs say add auth later. The publish button also appears on the public issue page whenever status is in_review, approved, or draft. That is fine for a private editor loop and not how I would ship a public Vercel app.',
  },
  {
    id: 'fantasy-blog-runtime',
    triggers: [
      'practice squad',
      'fantasy league blog',
      'fantasy-league-blog',
      'fantasy blog',
      'what does this run on',
      'what does it run on',
      'architecture',
      'wix',
      'vercel',
    ],
    minHits: 2,
    answer:
      'Practice Squad Rankings is a Next.js 16.3.4 App Router app, React 19, TypeScript strict, Tailwind 4, hosted on Vercel as project fantasy-league-blog. There is no database and no process.env usage in source. Pages import site.json. next/image is allowlisted to static.wixstatic.com. Locally I run next dev; production is next build on Vercel. Playwright is only for the Wix scrape on my machine, even though it is in dependencies. Node must be 20.9 or newer because that is what Next 16 declares. No Docker or worker dyno.',
  },
  {
    id: 'fantasy-blog-scoring',
    triggers: [
      'practice squad',
      'fantasy league blog',
      'fantasy-league-blog',
      'fantasy blog',
      'how does scoring',
      'parsepost',
      'ranking parser',
      'rank entries',
    ],
    minHits: 2,
    answer:
      'It does not compute fantasy points. I write the ranks; the app parses 12. Team (Name) blocks and optional Record / change lines. parsePost walks text blocks. If the first line looks like 12. Team Name (Person) or 11: …, that starts a rank card. Extra lines matching Weekly Change, Quarterly Change, Record, or Post Draft Ranking become stats; everything else until the next numbered header is body. Then I attach photos: skip a non-portrait lead image, match alt text to a person key, dump leftovers in order. 2024 often uses Post Draft Rank: while the regex wants Ranking, so those stats stay in the title block. That parser is in my working tree, not on origin/main.',
  },
  {
    id: 'fantasy-blog-storage',
    triggers: [
      'practice squad',
      'fantasy league blog',
      'fantasy-league-blog',
      'fantasy blog',
      'how is data stored',
      'site.json',
      'photo-crops',
      'no database',
    ],
    minHits: 2,
    answer:
      'Canonical content is src/content/site.json: about 23 posts, duplicated under seasons and a top-level posts array. Crops live in photo-crops.json plus localStorage. Images are Wix CDN URLs, not git blobs, after an 8 MB PNG blew up the first deploy. Git plus the leftover Wix site plus a local scrape/ folder are the backup. There is no Postgres, Redis, or CMS.',
  },
  {
    id: 'fantasy-blog-users',
    triggers: [
      'practice squad',
      'fantasy league blog',
      'fantasy-league-blog',
      'fantasy blog',
      'other people',
      'league-mates',
      'mau',
      'analytics',
    ],
    minHits: 2,
    answer:
      'I built it for the 12-team Seattle league I commissioner. The GitHub repo is public and Vercel is live at fantasy-league-blog.vercel.app. The repo has no analytics, so I cannot prove league-mates use this versus the old Wix site. Safe mode is a personal browser toggle so someone can open it at work without the league nickname and swears.',
  },
  {
    id: 'fantasy-blog-wix',
    triggers: [
      'practice squad',
      'fantasy league blog',
      'fantasy-league-blog',
      'fantasy blog',
      'wix',
      'copy of',
      'scrape',
      'playwright',
    ],
    minHits: 2,
    answer:
      'I got off Wix with a Playwright crawl of 26 seed URLs, BFS of in-site links, chrome stripping, and image download, then a compiler that writes site.json. I do not trust Wix slugs, so build-content.mjs has an explicit table: 2025 post-draft comes from copy-of-2024-post-draft-rankings-1, 2023 week 5 from copy-of-week-4, 2023 post-draft is Wix /week-1, and so on. If I had keyed off URL path I would have attached the wrong season.',
  },
  {
    id: 'fantasy-blog-hardest',
    triggers: [
      'practice squad',
      'fantasy league blog',
      'fantasy-league-blog',
      'fantasy blog',
      'hardest',
      'copy of',
      'deploy size',
      '8 mb',
    ],
    minHits: 2,
    answer:
      'The hard problem was getting faithful content off Wix. Live titles and URLs disagree because Wix duplicates pages as Copy of …. The scraper also picks up chrome, duplicate rich-text nodes, and transformed /v1/ image URLs. Second hard problem, proven in git: the first commit vendored every portrait, including an 8 MB PNG, which is a bad idea on Vercel, so the next commit rewrote JSON to CDN URLs and allowlisted the host. Third, still local: pairing faces to ranks when alts are Screenshot_… or clown.webp. None of this is distributed-systems hard; it is messy-CMS hard.',
  },
  {
    id: 'fantasy-blog-scale',
    triggers: [
      'practice squad',
      'fantasy league blog',
      'fantasy-league-blog',
      'fantasy blog',
      'scale it',
      'would you redo',
      'what would you not',
      'mdx',
    ],
    minHits: 2,
    answer:
      'I would not put a queue or a sports-data lake under this. Scale means more seasons, maybe multiple leagues, not millions of rows. I would stop duplicating posts in seasons and posts, derive generateStaticParams from JSON, and author new weeks in MDX so ranks are structured instead of recovered by regex. I would not keep POST /api/photo-crops as unauthenticated filesystem writes on Vercel, and I would not scrape Wix on a cron forever. Caching is already static generation; the bottleneck would be next/image pulling many Wix originals, which I would solve with a small media bucket, not Redis.',
  },
  {
    id: 'fantasy-blog-auth',
    triggers: [
      'practice squad',
      'fantasy league blog',
      'fantasy-league-blog',
      'fantasy blog',
      'photo crop',
      'unauthenticated',
      'no login',
      'safe mode',
    ],
    minHits: 2,
    answer:
      'There is no login. The site is public read. Safe mode is a client-only cosmetic filter from localStorage or ?safe=1. Adjust crops is an unauthenticated editor: localStorage immediately, then a debounced POST that writes photo-crops.json on that machine. If that API is deployed, it is a public write endpoint and Vercel’s filesystem is not a durable store. Fine for a single operator on a trusted laptop; not how I would ship a multi-editor product.',
  },
  {
    id: 'portfolio-runtime',
    triggers: [
      'personal website',
      'personal site',
      'github.io',
      'trevorfaust',
      'what does this run on',
      'astro',
      'github pages',
    ],
    minHits: 2,
    answer:
      'I built a static Astro 7 site. Locally I run Node 22+ and astro dev. Production is not a server I operate: GitHub Actions builds dist/ on Ubuntu and GitHub Pages serves the files at trevorfaust.github.io. There is no database and no SSR adapter. The only client JavaScript is a small IntersectionObserver in the layout.',
  },
  {
    id: 'portfolio-scoring',
    triggers: [
      'personal website',
      'personal site',
      'github.io',
      'scoring',
      'featured',
      'site.ts',
      'project cards',
    ],
    minHits: 2,
    answer:
      'There is no scoring algorithm on the portfolio. Project order and the Featured badge are fields I set in src/data/site.ts. Scoring, ranking, and pipelines mentioned on the cards live in other repositories, not in this one. If someone asks how DraftDNA scoring works, that answer has to come from the DraftDNA repo.',
  },
  {
    id: 'portfolio-storage',
    triggers: [
      'personal website',
      'personal site',
      'github.io',
      'how is data stored',
      'site.ts',
      'no database',
      'content module',
    ],
    minHits: 2,
    answer:
      'Content is a TypeScript module in git: src/data/site.ts holds name, links, five projects, about copy, and skills. Portraits are files under src/assets/ processed at build by astro:assets. There is no Postgres, Redis, or CMS. Backup is git.',
  },
  {
    id: 'portfolio-users',
    triggers: [
      'personal website',
      'personal site',
      'github.io',
      'other people',
      'analytics',
      'recruiters',
      'pageviews',
    ],
    minHits: 2,
    answer:
      'It is a public URL on GitHub Pages, so anyone can load it. I do not have analytics in this repo, so I cannot honestly quote visitors or conversion. The intended audience is recruiters and hiring managers. There is no login, session, or admin beyond whoever can push to main.',
  },
  {
    id: 'portfolio-deploy',
    triggers: [
      'personal website',
      'personal site',
      'github.io',
      'how do you deploy',
      'nojekyll',
      'github actions',
      'astro build',
    ],
    minHits: 2,
    answer:
      'Push to main, or workflow_dispatch. The workflow installs with npm ci, runs astro build, uploads dist, and deploys to the github-pages environment. I added public/.nojekyll because Astro writes hashed assets under _astro/, and GitHub Pages Jekyll would ignore that underscore folder.',
  },
  {
    id: 'portfolio-hardest',
    triggers: [
      'personal website',
      'personal site',
      'github.io',
      'hardest',
      'nojekyll',
      '_astro',
      'jekyll',
    ],
    minHits: 2,
    answer:
      'This codebase is small, so the sharpest production constraint is GitHub Pages plus Astro\'s _astro output: Jekyll ignores underscore directories, which would 404 hashed CSS, so .nojekyll is required. The other real problem is keeping a static site honest: one content module, no fake CMS, and images that should not ship as unoptimized blobs. A UX constraint I still have is hiding primary nav links below 768px, which simplifies the header but removes in-page jumps on small screens.',
  },
  {
    id: 'portfolio-production-gap',
    triggers: [
      'personal website',
      'personal site',
      'github.io',
      'portraits',
      'placeholder',
      'working tree',
      'production vs',
    ],
    minHits: 2,
    answer:
      'As of HEAD commit 00d1d1a, production still has TF / Photo coming soon placeholders. My working tree has real astro:assets portraits and contact-card changes that are not live until I commit and the Actions deploy finishes. I should not talk about the live site as if the portraits are already shipped.',
  },
];

export type FactMatchable = {
  question: string;
  related_requirement?: string;
};

export function matchCandidateFact(
  item: FactMatchable,
  facts: CandidateFact[] = CANDIDATE_FACTS
): CandidateFact | undefined {
  const hay = `${item.question} ${item.related_requirement ?? ''}`.toLowerCase();
  let best: { fact: CandidateFact; hits: number } | undefined;

  for (const fact of facts) {
    let hits = 0;
    for (const trigger of fact.triggers) {
      if (hay.includes(trigger.toLowerCase())) hits += 1;
    }
    if (hits < fact.minHits) continue;
    if (!best || hits > best.hits) best = { fact, hits };
  }

  return best?.fact;
}

function isPlaceholderAnswer(text: string | undefined): boolean {
  const value = (text ?? '').trim().toLowerCase();
  if (!value) return true;
  return /^(n\/?a|skip+|no|not really|idk|i don'?t know\.?)$/.test(value);
}

export function withFactDrafts<T extends FactMatchable & { id: string }>(
  questions: T[],
  existing: Record<string, string>,
  facts: CandidateFact[] = CANDIDATE_FACTS
): Record<string, string> {
  const next = { ...existing };
  for (const question of questions) {
    if (!isPlaceholderAnswer(next[question.id])) continue;
    const fact = matchCandidateFact(question, facts);
    if (fact) next[question.id] = fact.answer;
  }
  return next;
}
