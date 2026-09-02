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
    match: /draft|nfl|draftdna/i,
    bullets: [
      'Designed an NFL draft platform at draftdna.com that scores prospects across 32 teams using 200M+ historical records.',
      'Shipped a mock draft simulator that issues 400+ draft badges so users can compare board strategy across the league.',
      'Built the data layer in Python and PostgreSQL, with a React and TypeScript front end on Supabase and Tailwind.',
      'Automated ingest and cleaning so weekly player updates refresh rankings without a manual spreadsheet pass.',
    ],
  },
  {
    match: /newsletter|digest/i,
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
