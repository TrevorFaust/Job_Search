/**
 * Team and league job boards watched daily for priority listings.
 * Each entry becomes job.source (unique per team/board).
 */
export const NFL_PRIORITY_WATCHES = [
  {
    id: 'cardinals',
    label: 'Arizona Cardinals',
    url: 'https://www.teamworkonline.com/football-jobs/arizona-cardinals-jobs/arizona-cardinals',
    platform: 'teamwork',
    config: {
      listingUrl:
        'https://www.teamworkonline.com/football-jobs/arizona-cardinals-jobs/arizona-cardinals',
    },
  },
  {
    id: 'falcons',
    label: 'Atlanta Falcons',
    url: 'https://ambgroup.wd1.myworkdayjobs.com/AMBSE',
    platform: 'workday',
    config: {
      apiUrl: 'https://ambgroup.wd1.myworkdayjobs.com/wday/cxs/ambgroup/AMBSE/jobs',
      siteUrl: 'https://ambgroup.wd1.myworkdayjobs.com/en-US/AMBSE',
    },
  },
  {
    id: 'ravens',
    label: 'Baltimore Ravens',
    url: 'https://www.baltimoreravens.com/employment',
    platform: 'employment-page',
    config: { listingUrl: 'https://www.baltimoreravens.com/employment', mode: 'dayforce-link-title' },
  },
  {
    id: 'bills',
    label: 'Buffalo Bills',
    url: 'https://recruiting.ultipro.com/HOC10001BFLO/JobBoard/fe63f75a-e850-45d2-8772-63a210927fdc/?q=&o=postedDateDesc',
    platform: 'ultipro',
    config: {
      listingUrl:
        'https://recruiting.ultipro.com/HOC10001BFLO/JobBoard/fe63f75a-e850-45d2-8772-63a210927fdc/?q=&o=postedDateDesc',
    },
  },
  {
    id: 'panthers',
    label: 'Carolina Panthers',
    url: 'https://www.panthers.com/about-us/employment',
    platform: 'employment-page',
    config: {
      listingUrl: 'https://www.panthers.com/about-us/employment',
      mode: 'dayforce-apply-blocks',
    },
  },
  {
    id: 'chicagobears',
    label: 'Chicago Bears',
    url: 'https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=0103272e-a631-4293-97b2-7da68f74bc1f&ccId=19000101_000001&type=MP&lang=en_US&selectedMenuKey=CareerCenter',
    platform: 'adp',
    config: {
      cid: '0103272e-a631-4293-97b2-7da68f74bc1f',
      ccId: '19000101_000001',
      careersUrl:
        'https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=0103272e-a631-4293-97b2-7da68f74bc1f&ccId=19000101_000001&type=MP&lang=en_US&selectedMenuKey=CareerCenter',
    },
  },
  {
    id: 'bengals',
    label: 'Cincinnati Bengals',
    url: 'https://www.teamworkonline.com/football-jobs/footballjobs/cincinnati-bengals',
    platform: 'teamwork',
    config: {
      listingUrl: 'https://www.teamworkonline.com/football-jobs/footballjobs/cincinnati-bengals',
    },
  },
  {
    id: 'browns',
    label: 'Cleveland Browns',
    url: 'https://clevelandbrowns.isolvedhire.com/jobs/',
    platform: 'isolved',
    config: { listingUrl: 'https://clevelandbrowns.isolvedhire.com/jobs/' },
  },
  {
    id: 'cowboys',
    label: 'Dallas Cowboys',
    url: 'https://jobs.dayforcehcm.com/jonesentities/DALLASCOWBOYSFOOTBALLCLUB',
    platform: 'dayforce',
    config: {
      listingUrl: 'https://jobs.dayforcehcm.com/jonesentities/DALLASCOWBOYSFOOTBALLCLUB',
      clientNamespace: 'jonesentities',
    },
  },
  {
    id: 'broncos',
    label: 'Denver Broncos',
    url: 'https://job-boards.greenhouse.io/denverbroncosteamllc',
    platform: 'greenhouse',
    config: { boardToken: 'denverbroncosteamllc' },
  },
  {
    id: 'lions',
    label: 'Detroit Lions',
    url: 'https://job-boards.greenhouse.io/detroitlions',
    platform: 'greenhouse',
    config: { boardToken: 'detroitlions' },
  },
  {
    id: 'packers',
    label: 'Green Bay Packers',
    url: 'https://jobs.dayforcehcm.com/en-US/greenbaypackers/CANDIDATEPORTAL',
    platform: 'dayforce',
    config: {
      listingUrl: 'https://jobs.dayforcehcm.com/en-US/greenbaypackers/CANDIDATEPORTAL',
      clientNamespace: 'greenbaypackers',
      extraListingUrls: ['https://jobs.dayforcehcm.com/en-US/greenbaypackers/PACWebSite'],
    },
  },
  {
    id: 'texans',
    label: 'Houston Texans',
    url: 'https://www.teamworkonline.com/football-jobs/texans/houston-texans',
    platform: 'teamwork',
    config: { listingUrl: 'https://www.teamworkonline.com/football-jobs/texans/houston-texans' },
  },
  {
    id: 'colts',
    label: 'Indianapolis Colts',
    url: 'https://www.teamworkonline.com/football-jobs/indianapolis-colts-jobs/indianapolis-colts',
    platform: 'teamwork',
    config: {
      listingUrl:
        'https://www.teamworkonline.com/football-jobs/indianapolis-colts-jobs/indianapolis-colts',
    },
  },
  {
    id: 'jaguars',
    label: 'Jacksonville Jaguars',
    url: 'https://www.teamworkonline.com/football-jobs/footballjobs/nfl-football-jobs?employment_opportunity_search%5Borganization_id%5D=28261',
    platform: 'teamwork',
    config: {
      listingUrl:
        'https://www.teamworkonline.com/football-jobs/footballjobs/nfl-football-jobs?employment_opportunity_search%5Borganization_id%5D=28261',
    },
  },
  {
    id: 'chiefs',
    label: 'Kansas City Chiefs',
    url: 'https://www.teamworkonline.com/football-jobs/chiefs/kansas-city-chiefs-29577',
    platform: 'teamwork',
    config: {
      listingUrl: 'https://www.teamworkonline.com/football-jobs/chiefs/kansas-city-chiefs-29577',
    },
  },
  {
    id: 'raiders',
    label: 'Las Vegas Raiders',
    url: 'https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=58d2d945-3a8e-4bea-81f1-e18a4a93c137&ccId=19000101_000001&type=MP&lang=en_US',
    platform: 'adp',
    config: {
      cid: '58d2d945-3a8e-4bea-81f1-e18a4a93c137',
      ccId: '19000101_000001',
      careersUrl:
        'https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=58d2d945-3a8e-4bea-81f1-e18a4a93c137&ccId=19000101_000001&type=MP&lang=en_US&selectedMenuKey=CareerCenter',
    },
  },
  {
    id: 'chargers',
    label: 'Los Angeles Chargers',
    url: 'https://www.linkedin.com/company/los-angeles-chargers/jobs/',
    platform: 'linkedin',
    disabled: true,
    disabledReason: 'LinkedIn requires sign-in; no reliable public job API',
  },
  {
    id: 'rams',
    label: 'Los Angeles Rams',
    url: 'https://www.teamworkonline.com/football-jobs/la-rams-careers/los-angeles-rams',
    platform: 'teamwork',
    config: {
      listingUrl: 'https://www.teamworkonline.com/football-jobs/la-rams-careers/los-angeles-rams',
    },
  },
  {
    id: 'dolphins',
    label: 'Miami Dolphins',
    url: 'https://www.teamworkonline.com/football-jobs/miami-dolphins-jobs/miami-dolphins',
    platform: 'teamwork',
    config: {
      listingUrl: 'https://www.teamworkonline.com/football-jobs/miami-dolphins-jobs/miami-dolphins',
    },
  },
  {
    id: 'vikings',
    label: 'Minnesota Vikings',
    url: null,
    platform: 'none',
    disabled: true,
    disabledReason: 'No public careers URL provided',
  },
  {
    id: 'patriots',
    label: 'New England Patriots',
    url: 'https://www.paycomonline.net/v4/ats/web.php/portal/715F4103F5E4D572C92AFE85684343DC/career-page?jobSearchSettingsId=9272',
    platform: 'paycom',
    config: {
      listingUrl:
        'https://www.paycomonline.net/v4/ats/web.php/portal/715F4103F5E4D572C92AFE85684343DC/career-page?jobSearchSettingsId=9272',
      portalId: '715F4103F5E4D572C92AFE85684343DC',
    },
  },
  {
    id: 'saints',
    label: 'New Orleans Saints',
    url: 'https://jobs.dayforcehcm.com/bensonenterprises/SAINTSPELSCAREERS',
    platform: 'dayforce',
    config: {
      listingUrl: 'https://jobs.dayforcehcm.com/bensonenterprises/SAINTSPELSCAREERS',
      clientNamespace: 'bensonenterprises',
    },
  },
  {
    id: 'giants',
    label: 'New York Giants',
    url: 'https://www.teamworkonline.com/football-jobs/new-york-giants-jobs/new-york-giants',
    platform: 'teamwork',
    config: {
      listingUrl: 'https://www.teamworkonline.com/football-jobs/new-york-giants-jobs/new-york-giants',
    },
  },
  {
    id: 'jets',
    label: 'New York Jets',
    url: 'https://www.teamworkonline.com/football-jobs/footballjobs/nfl-football-jobs?employment_opportunity_search%5Borganization_id%5D=28617',
    platform: 'teamwork',
    config: {
      listingUrl:
        'https://www.teamworkonline.com/football-jobs/footballjobs/nfl-football-jobs?employment_opportunity_search%5Borganization_id%5D=28617',
    },
  },
  {
    id: 'eagles',
    label: 'Philadelphia Eagles',
    url: 'https://job-boards.greenhouse.io/philadelphiaeagles',
    platform: 'greenhouse',
    config: { boardToken: 'philadelphiaeagles' },
  },
  {
    id: 'steelers',
    label: 'Pittsburgh Steelers',
    url: 'https://www.teamworkonline.com/football-jobs/footballjobs/pittsburgh-steelers-',
    platform: 'teamwork',
    config: {
      listingUrl: 'https://www.teamworkonline.com/football-jobs/footballjobs/pittsburgh-steelers-',
    },
  },
  {
    id: '49ers',
    label: 'San Francisco 49ers',
    url: null,
    platform: 'none',
    disabled: true,
    disabledReason: 'No public careers URL provided',
  },
  {
    id: 'seahawks',
    label: 'Seattle Seahawks',
    url: 'https://www2.seahawks.com/employment/openings/',
    platform: 'jazzhr',
    config: {
      listingUrl: 'https://seattleseahawks.applytojob.com/apply/jobs/?s_keywords=company%3A%20fnw',
      careersUrl: 'https://www2.seahawks.com/employment/openings/',
    },
  },
  {
    id: 'buccaneers',
    label: 'Tampa Bay Buccaneers',
    url: 'https://jobs.dayforcehcm.com/en-US/tbb/CANDIDATEPORTALTBB?payClass=1',
    platform: 'dayforce',
    config: {
      listingUrl: 'https://jobs.dayforcehcm.com/en-US/tbb/CANDIDATEPORTALTBB?payClass=1',
      clientNamespace: 'tbb',
    },
  },
  {
    id: 'titans',
    label: 'Tennessee Titans',
    url: 'https://jobs.dayforcehcm.com/titans/CANDIDATEPORTAL',
    platform: 'dayforce',
    config: {
      listingUrl: 'https://jobs.dayforcehcm.com/titans/CANDIDATEPORTAL',
      clientNamespace: 'titans',
    },
  },
  {
    id: 'commanders',
    label: 'Washington Commanders',
    url: 'https://www.teamworkonline.com/football-jobs/washington-commanders-jobs/washington-commanders-jobs',
    platform: 'teamwork',
    config: {
      listingUrl:
        'https://www.teamworkonline.com/football-jobs/washington-commanders-jobs/washington-commanders-jobs',
    },
  },
  {
    id: 'nfl-league',
    label: 'NFL League Office',
    url: 'https://job-boards.greenhouse.io/nflcareers',
    platform: 'greenhouse',
    config: { boardToken: 'nflcareers' },
  },
  {
    id: 'mlb-league',
    label: 'MLB League Office',
    url: 'https://www.mlb.com/careers/opportunities',
    platform: 'greenhouse',
    config: { boardToken: 'majorleaguebaseball' },
  },
  {
    id: 'teamwork-all-sports',
    label: 'TeamWork Online (NFL jobs)',
    url: 'https://www.teamworkonline.com/football-jobs/footballjobs/nfl-football-jobs',
    platform: 'teamwork',
    config: {
      listingUrl: 'https://www.teamworkonline.com/football-jobs/footballjobs/nfl-football-jobs',
    },
  },
  {
    id: 'cubs-fo',
    label: 'Chicago Cubs',
    url: 'https://my1060wd.wd5.myworkdayjobs.com/en-US/Chicago_Cubs_FO',
    platform: 'workday',
    config: {
      apiUrl: 'https://my1060wd.wd5.myworkdayjobs.com/wday/cxs/my1060wd/Chicago_Cubs_FO/jobs',
      siteUrl: 'https://my1060wd.wd5.myworkdayjobs.com/en-US/Chicago_Cubs_FO',
    },
  },
  {
    id: 'cubs-seasonal',
    label: 'Chicago Cubs Seasonal',
    url: 'https://my1060wd.wd5.myworkdayjobs.com/en-US/Chicago_Cubs_Seasonal',
    platform: 'workday',
    config: {
      apiUrl: 'https://my1060wd.wd5.myworkdayjobs.com/wday/cxs/my1060wd/Chicago_Cubs_Seasonal/jobs',
      siteUrl: 'https://my1060wd.wd5.myworkdayjobs.com/en-US/Chicago_Cubs_Seasonal',
    },
  },
  {
    id: 'marquee-360',
    label: 'Marquee 360',
    url: 'https://my1060wd.wd5.myworkdayjobs.com/en-US/Marquee_360',
    platform: 'workday',
    config: {
      apiUrl: 'https://my1060wd.wd5.myworkdayjobs.com/wday/cxs/my1060wd/Marquee_360/jobs',
      siteUrl: 'https://my1060wd.wd5.myworkdayjobs.com/en-US/Marquee_360',
    },
  },
  {
    id: 'marquee-development',
    label: 'Marquee Development',
    url: 'https://my1060wd.wd5.myworkdayjobs.com/en-US/Marquee_Development',
    platform: 'workday',
    config: {
      apiUrl: 'https://my1060wd.wd5.myworkdayjobs.com/wday/cxs/my1060wd/Marquee_Development/jobs',
      siteUrl: 'https://my1060wd.wd5.myworkdayjobs.com/en-US/Marquee_Development',
    },
  },
  {
    id: 'marquee',
    label: 'Marquee Sports Network',
    url: 'https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=ff153427-7699-4a48-bfec-f91b40e88134&ccId=19000101_000001&lang=en_US',
    platform: 'adp',
    config: {
      cid: 'ff153427-7699-4a48-bfec-f91b40e88134',
      ccId: '19000101_000001',
      careersUrl:
        'https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=ff153427-7699-4a48-bfec-f91b40e88134&ccId=19000101_000001&lang=en_US&selectedMenuKey=CareerCenter',
    },
  },
  {
    id: 'bulls',
    label: 'Chicago Bulls',
    url: 'https://www.nba.com/bulls/career-opportunities',
    platform: 'paylocity',
    config: {
      feedId: '35b60d3d-0f5f-416a-af65-795625fbfcc4',
    },
  },
  {
    id: 'blackhawks',
    label: 'Chicago Blackhawks',
    url: 'https://apply.clearcompany.com/wirtzcorp',
    platform: 'clearcompany',
    config: {
      siteId: '7f603834-d6d5-947c-d663-7b6908ba1fed',
      listingUrl: 'https://apply.clearcompany.com/wirtzcorp',
    },
  },
  {
    id: 'chicagofire',
    label: 'Chicago Fire FC',
    url: 'https://www.teamworkonline.com/soccer-jobs/chicago-fire-fc/chicago-fire',
    platform: 'teamwork',
    config: {
      listingUrl: 'https://www.teamworkonline.com/soccer-jobs/chicago-fire-fc/chicago-fire',
    },
  },
  {
    id: 'wnba',
    label: 'WNBA',
    url: 'https://www.teamworkonline.com/basketball-jobs/wnbateamjobs/wnba-team-jobs',
    platform: 'teamwork',
    config: {
      listingUrl: 'https://www.teamworkonline.com/basketball-jobs/wnbateamjobs/wnba-team-jobs',
    },
  },
];

export const alertMeta = Object.fromEntries(
  NFL_PRIORITY_WATCHES.filter((w) => w.url).map((w) => [w.id, { alertLabel: w.label, alertUrl: w.url }])
);

export function getEnabledWatches() {
  return NFL_PRIORITY_WATCHES.filter((w) => !w.disabled && w.platform !== 'none' && w.url);
}
