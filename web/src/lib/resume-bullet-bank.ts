function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function alreadyUsed(existing: string[], candidate: string) {
  const needle = normalize(candidate).slice(0, 48);
  return existing.some((b) => {
    const have = normalize(b);
    return have.includes(needle) || needle.includes(have.slice(0, 48));
  });
}

type BulletPack = {
  match: RegExp;
  bullets: string[];
};

const PACKS: BulletPack[] = [
  {
    match: /practice squad|fantasy-league-blog|fantasy league blog|fantasy blog/i,
    bullets: [
      'Migrated a Wix fantasy-league blog to a Next.js 16 / React 19 site with statically generated season and post routes for 23 recaps across 2023–2025.',
      'Built a Playwright crawler and content compiler that remaps Wix “Copy of …” URLs onto clean /[year]/[slug] routes and emits a typed site.json source of truth.',
      'Replaced git-hosted images with Wix CDN URLs after a cover PNG exceeded 8 MB, cutting deploy payload while keeping next/image remotePatterns locked to static.wixstatic.com.',
      'Implemented a regex ranking parser that splits commissioner prose into intro, 12 rank entries, and typed stats (Weekly Change, Quarterly Change, Record).',
      'Added heuristic person resolution (parentheticals, image alts, team-name aliases) to auto-attach portraits to rank cards.',
      'Built a year-scoped photo crop editor (pointer drag, wheel zoom, keyboard) that persists via localStorage and a JSON file API, with clamp/debounce.',
      'Shipped a client Safe Mode that censors swears and the league nickname, hydrating from localStorage or ?safe=1.',
      'Kept scrape artifacts out of Vercel uploads with .vercelignore after the first deploy-size pass.',
    ],
  },
  {
    match: /scoutdna|scout dna|all 32|fantasy digest|nfl digest|camp.?signal|newsletter pipeline/i,
    bullets: [
      'Built a 32-team NFL digest that collects Reddit, ESPN RSS, YouTube, and podcasts into Postgres, then composes a cited weekly recap with Anthropic Claude after a Tuesday usage sync.',
      'Integrated with an existing DraftDNA database using newsletter_* tables so collect/compose does not collide with public.teams, while still reading depth, players, and usage.',
      'Shipped a camp-signal queue: Claude extracts up/down mentions, code scores a 7-day window with reprint collapse, and battles only change after an approve API writes an audit row.',
      'Clustered beat notes with thefuzz title matching at 72 and stitched weekly story arcs so midweek will-play previews close against later box scores.',
      'Synced nflverse parquet (rosters, depth, snaps, weekly stats, schedules) plus ESPN preseason boxes into player_week_usage and team_week_results for cited PPR and share copy.',
      'Ran dual schedulers (Windows 1am/3am PT and GitHub Actions ubuntu-latest, collect job up to 8 hours) so ingest continues if the desktop is off.',
      'Shipped a Next.js 15 review UI for rumor confirm/reject with optional Claude rewrite, usage board, camp proposals, and a publish route.',
      'Paged PostgREST at 1000 rows after weekly windows and rosters_2026 (2000+) would otherwise truncate.',
    ],
  },
  {
    match: /apartment hunt|apartment listing|daily apartment|rental site|craigslist|apartments\.com/i,
    bullets: [
      'Built a personal TypeScript pipeline that scrapes rental sites once daily, upserts into Supabase Postgres, and emails a new-listings digest via Resend.',
      'Scheduled the scrape on GitHub Actions with headed Chrome under Xvfb so Apartments.com bot checks do not fail the run.',
      'Added a Next.js 16 board to browse, filter, favorite, and hide listings using Server Actions against the same Postgres tables.',
      'Implemented idempotent ingest on (source, external_id), updating last_seen_at while preserving first_seen_at, favorites, and hidden flags.',
      'Isolated each source adapter in try/catch so a blocked site marks -1 and the rest of the digest still runs.',
      'Designed preference matching that over-includes on missing numeric fields and drops listings without coordinates when a radius is set.',
    ],
  },
  {
    match: /channel representative/i,
    bullets: [
      'Grew a 7-person inside sales and applications team covering the Pacific Northwest, tying distributor training to weekly Power BI pipeline reviews.',
      'Raised customer retention about 20% by installing a follow-up cadence and quoting playbook for regional distributors.',
      'Built Power BI dashboards for quoting, backlog, and win rate so the team prioritized accounts by margin and activity.',
      'Partnered with plant and product specialists to turn application issues into standard work that channel partners could repeat.',
      'Ran weekly forecast reviews with distributors, reconciling CRM notes against shipments to flag at-risk orders early.',
    ],
  },
  {
    match: /process engineer/i,
    bullets: [
      'Cut about $2M in cost and 700 labor hours by redesigning a production process and locking the new standard into the plant schedule.',
      'Built Excel and VBA tools that scheduled jobs and labor so supervisors could see capacity gaps before the shift started.',
      'Wrote process proposals and walked operations, quality, and sales through tradeoffs so stakeholders signed off before rollout.',
      'Mapped floor bottlenecks, then used the data to sequence changeovers and cut idle time between jobs.',
    ],
  },
  {
    match: /draftdna|draft dna|nfl data platform/i,
    bullets: [
      'Shipped Draft DNA (draftdna.com): a production Vite/React 18/TypeScript SPA on Vercel with Supabase Postgres, Auth, Realtime, and Deno Edge Functions for 2026 fantasy rankings, mocks, leagues, and contests.',
      'Designed an 18-bucket ranking model (standard/PPR/half-PPR × redraft/dynasty × 1QB/superflex × rookies-only) with drag-and-drop boards, CSV/XLSX/PDF import, and PDF/CSV export.',
      'Implemented community consensus as a weighted average: vendor baseline ranks count as 100 votes per player and each signed-in board counts as 1, so one user cannot swing ADP.',
      'Wrote a browser CPU drafter that scores ADP proximity × archetype weights (nudge 0.22), force-fills starter holes late, gates DST/K rounds, and caps reaches at about one round.',
      'Built multiplayer mocks as Postgres-authoritative state: invite/open lobbies, pick-clock RPCs, SQL BPA autodraft, Realtime plus poll fallback, and 10-minute idle expiry.',
      'Detected draft archetypes from pick sequences and mapped them onto a generated catalog of 100 named badges, plus about 28 chaos triggers.',
      'Ingested Sleeper, ESPN scoreboard, and nflverse roster/weekly CSVs with 1000-row pagination, dry-run upserts by gsis_id, and an optional daily pg_cron team sync.',
      'Shipped league multi-tenancy with RLS and SECURITY DEFINER RPCs: invites, seat claims, keepers, Team Rankings crowd averages, and weekly pick\'em locked at kickoff.',
    ],
  },
  {
    match: /job digest|job newsletter/i,
    bullets: [
      'Built a daily job digest pipeline that scrapes listings, filters by fit and location, and emails a ranked shortlist.',
      'Wrote parsing and deduping logic so the same posting from multiple boards lands as one job instead of noise.',
    ],
  },
  {
    match: /job.?board|job hunt|tailor/i,
    bullets: [
      'Built a personal job board in Next.js that scores listings against a resume corpus and stores tailored drafts per role.',
      'Added one-page Cambria PDF export so each application uses the same template with job-specific bullets.',
    ],
  },
];

export function suggestedBulletsFor(title: string, existingTexts: string[]): string[] {
  const pack = PACKS.find((p) => p.match.test(title));
  if (!pack) return [];
  return pack.bullets.filter((b) => !alreadyUsed(existingTexts, b)).slice(0, 4);
}
