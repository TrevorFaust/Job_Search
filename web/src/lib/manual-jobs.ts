/** Job shape used by the tailor wizard (scraped or manual). */
export type TailorJobView = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  salary: string | null;
  description: string;
  source: string;
  isManual: boolean;
  created_at?: string;
};

export type ManualJob = {
  id: string;
  subscriber_id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  salary: string | null;
  description: string;
  created_at: string;
  updated_at: string;
};

export type ManualJobWithSession = ManualJob & {
  session_id: string | null;
  session_status: string | null;
  has_output: boolean;
};

export function manualJobToView(job: ManualJob): TailorJobView {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url,
    salary: job.salary,
    description: job.description,
    source: 'manual',
    isManual: true,
    created_at: job.created_at,
  };
}

/** Map a subscriber manual job into the board list shape (scraped jobs use numeric ids). */
export function manualJobToBoardView(job: ManualJob) {
  return {
    id: 0,
    source: 'manual',
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url ?? '',
    salary: job.salary,
    salary_min_annual: null,
    salary_max_annual: null,
    description: job.description,
    posted_at: null,
    created_at: job.created_at,
    status: 'active',
    isManual: true as const,
    manual_job_id: job.id,
  };
}
