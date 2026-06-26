import Anthropic from '@anthropic-ai/sdk';
import {
  addressCandidateDirectly,
  extractResumeStructure,
  stripResumeBulletPrefixes,
  type ResumeFormatMeta,
} from './resume-structure';

export type GapItem = {
  skill: string;
  resume_evidence: string;
};

export type PartialMatch = GapItem & {
  reframe_suggestion: string;
};

export type GapRequirement = {
  requirement: string;
  severity: 'required' | 'preferred';
};

export type GapAnalysis = {
  strong_matches: GapItem[];
  partial_matches: PartialMatch[];
  gaps: GapRequirement[];
  summary: string;
  fit_level?: 'strong' | 'moderate' | 'stretch' | 'long_shot';
};

export type TailorQuestion = {
  id: string;
  question: string;
  context: string;
  related_requirement: string;
  suggested_answers?: string[];
};

export type TailorAnswer = {
  question_id: string;
  answer: string;
  question?: string;
  related_requirement?: string;
};

export type GenerateOptions = {
  extraContext?: string;
  pageLength?: 'one' | 'two';
  formatMeta?: ResumeFormatMeta;
};

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured');
  return new Anthropic({ apiKey: key });
}

function getModel() {
  return process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
}

function parseJsonResponse<T>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(raw) as T;
}

function guessCandidateName(resumeText: string): string | null {
  const first = resumeText.split('\n').map((l) => l.trim()).find(Boolean);
  if (!first || first.length > 50) return null;
  if (/@|\d{3}/.test(first)) return null;
  if (/^(profile|summary|experience|education|skills)/i.test(first)) return null;
  return first;
}

function directVoice(text: string, resumeText: string) {
  return addressCandidateDirectly(text, guessCandidateName(resumeText));
}

async function claudeText(system: string, user: string, maxTokens = 8192): Promise<string> {
  const client = getClient();
  const response = await client.messages.create({
    model: getModel(),
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    temperature: 0.4,
  });

  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('Empty response from AI');
  return block.text.trim();
}

const VOICE_RULES = `
Voice rules (critical):
- Speak directly TO the candidate using "you" and "your" — never "the candidate", "they", or the person's name in third person.
- Questions must address the reader as "you" (e.g. "Do you have experience with…").
- gap_analysis.summary and reframe_suggestion fields: write as if talking to the reader ("You're a strong fit because…", "You could reframe X as…").
- resume_evidence may quote the resume in third person, but surrounding analysis must use "you".`;

const ANALYZE_SYSTEM = `You are an expert resume writer and career strategist with 15+ years of experience tailoring resumes for competitive roles.

PHASE 1 — Discovery (you are in this phase now)

Compare the job posting to the candidate's resume. Do NOT rewrite the resume yet.

Ask targeted clarifying questions (3–5 ideal; up to 7 if needed). Questions should:
- Identify gaps the candidate might fill with unlisted or adjacent experience
- Surface context bullets can't convey (team size, outcomes, scale)
- Probe transferable angles ("This role emphasizes X — have you done a version of this?")
- Flag missing JD keywords and ask if relevant experience exists but isn't documented
- Explore career narrative (pivot, step up, lateral — how should we frame it?)

Keep questions conversational, not clinical.
${VOICE_RULES}

Other rules:
- NEVER invent experience for the candidate.
- Note honest reframing angles even for stretch roles.
- Set fit_level: strong | moderate | stretch | long_shot.
- If prior_answers are provided, do NOT re-ask similar questions.
- Respond with a single JSON object only — no markdown fences.`;

const GENERATE_SYSTEM = `You are an expert resume writer and career strategist with 15+ years of experience tailoring resumes for competitive roles.

PHASE 2 — Rewriting (you are in this phase now)

You MUST always output a complete tailored resume draft. Never refuse. Never tell the candidate not to apply.

Content selection (critical — curate, do not transcribe):
- The master resume is a source library, NOT a checklist. Include ONLY roles, projects, and education that strengthen THIS application.
- Omit entire jobs, internships, or education entries that are irrelevant to the target role (e.g. unrelated college research when applying to sports analytics).
- Within one employer, include only the sub-roles or responsibilities that match the job — drop unrelated hats entirely (e.g. at a company with 3 roles, keep only the database/engineering work for a data role).
- Reorder sections and entries so the most relevant experience appears first within each section.
- NEVER pad with low-relevance jobs just to fill space. If the draft runs short, expand the most relevant roles instead: add more accomplishment lines, metrics, and context drawn from the same job or project — not unrelated history.

Length:
- Default: ONE FULL PAGE (~450–550 words in the resume body). The page should feel complete, not sparse.
- Fill the page by going deeper on relevant work (4–6 lines on key roles, 2–3 on supporting roles) — not by re-adding omitted or tangential jobs.
- If page_length is "two", you may use up to two pages but still curate aggressively; same rule applies — depth on relevant content, not breadth of unrelated roles.

Structure & formatting (match the original resume layout):
- Keep the SAME section headers and section ORDER as original_structure when provided (skip sections that would be empty after curation).
- Keep contact/header lines at the top in the same style.
- Do NOT use bullet characters (•, -, *, etc.) on accomplishment lines. Write each achievement as a plain text line — the candidate pastes into a template that already has bullets.
- Do NOT add markdown, code fences, or commentary before the resume.
- Resume body uses professional implied-first-person lines — never refer to the candidate by name in the resume text.

If fit is weak: still produce a full one-page resume — heavily tailor Profile/Summary, light keyword alignment elsewhere, never fabricate credentials.

Rewriting principles:
1. Mirror JD language where truthful (ATS keywords).
2. Impact lines: [Verb] + [action] + [result/scale when available].
3. Within each role, lead with the most relevant accomplishments.
4. Tailor Profile/Summary in 2–3 tight sentences focused on this role.
5. Vary action verbs — no repeating the same verb across lines (use synonyms: built/constructed/developed/engineered/etc.).
6. Never invent employers, titles, dates, degrees, certifications, or skills.

Output format:
1. Full resume text (sections + plain accomplishment lines, no bullet prefixes) — this is what the candidate copies into their template.
2. Blank line, then "Keyword Alignment" section listing 5–8 JD terms with Yes / Partial / Gap.`;

export async function analyzeResumeForJob(
  resumeText: string,
  job: { title: string; company: string | null; description: string },
  priorAnswers: TailorAnswer[] = []
): Promise<{ gap_analysis: GapAnalysis; questions: TailorQuestion[] }> {
  const userPrompt = JSON.stringify({
    job: {
      title: job.title,
      company: job.company,
      description: job.description.slice(0, 12000),
    },
    resume: resumeText.slice(0, 12000),
    prior_answers: priorAnswers.map((a) => ({
      question: a.question ?? a.question_id,
      answer: a.answer,
      related_requirement: a.related_requirement ?? '',
    })),
    output_schema: {
      gap_analysis: {
        strong_matches: [{ skill: 'string', resume_evidence: 'string' }],
        partial_matches: [
          { skill: 'string', resume_evidence: 'string', reframe_suggestion: 'string (use "you")' },
        ],
        gaps: [{ requirement: 'string', severity: 'required | preferred' }],
        summary: '2-3 sentences speaking directly to the reader as "you"',
        fit_level: 'strong | moderate | stretch | long_shot',
      },
      questions: [
        {
          id: 'q1',
          question: 'string (address reader as "you")',
          context: 'string (use "you")',
          related_requirement: 'string',
          suggested_answers: ['optional'],
        },
      ],
    },
  });

  const raw = await claudeText(
    ANALYZE_SYSTEM,
    `Analyze this resume against the job. Return JSON with gap_analysis and 3–7 new questions.\n\n${userPrompt}`
  );

  const parsed = parseJsonResponse<{ gap_analysis: GapAnalysis; questions: TailorQuestion[] }>(raw);
  const gap = parsed.gap_analysis;

  return {
    gap_analysis: {
      ...gap,
      summary: directVoice(gap.summary, resumeText),
      strong_matches: (gap.strong_matches ?? []).map((m) => ({
        ...m,
        resume_evidence: directVoice(m.resume_evidence, resumeText),
      })),
      partial_matches: (gap.partial_matches ?? []).map((m) => ({
        ...m,
        resume_evidence: directVoice(m.resume_evidence, resumeText),
        reframe_suggestion: directVoice(m.reframe_suggestion, resumeText),
      })),
    },
    questions: (parsed.questions ?? []).slice(0, 7).map((q, i) => ({
      ...q,
      id: q.id || `q${i + 1}`,
      question: directVoice(q.question, resumeText),
      context: directVoice(q.context, resumeText),
    })),
  };
}

export async function generateTailoredResume(
  resumeText: string,
  job: { title: string; company: string | null; description: string },
  gapAnalysis: GapAnalysis,
  answers: TailorAnswer[],
  options: GenerateOptions = {}
): Promise<string> {
  const formatMeta = options.formatMeta ?? extractResumeStructure(resumeText);
  const pageLength = options.pageLength ?? 'one';

  const user = [
    `Job title: ${job.title}`,
    `Company: ${job.company ?? 'Unknown'}`,
    `page_length: ${pageLength}`,
    '',
    'Job description:',
    job.description.slice(0, 10000),
    '',
    'Original resume (preserve this structure and section names):',
    resumeText.slice(0, 10000),
    '',
    'original_structure:',
    JSON.stringify(formatMeta),
    '',
    'Gap analysis:',
    JSON.stringify(gapAnalysis),
    '',
    'Candidate Q&A (authoritative — do not go beyond these confirmations):',
    JSON.stringify(answers),
    '',
    'Additional context from the candidate:',
    options.extraContext?.trim() || '(none provided)',
    '',
    'Write the tailored ONE-PAGE resume now (unless page_length is two). Curate for relevance — omit unrelated jobs. Fill the page by expanding relevant roles, not by adding back low-relevance jobs. No bullet characters on accomplishment lines. Mirror original_structure. Output the full resume — never refuse.',
  ].join('\n');

  const text = await claudeText(GENERATE_SYSTEM, user, 12000);
  if (!text) throw new Error('Empty response from AI');
  return stripResumeBulletPrefixes(text);
}
