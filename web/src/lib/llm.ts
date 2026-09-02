import Anthropic from '@anthropic-ai/sdk';
import {
  addressCandidateDirectly,
  extractResumeStructure,
  stripResumeBulletPrefixes,
  type ResumeFormatMeta,
} from './resume-structure';
import { normalizeFitScore } from './fit-level';
import type { FitLevel } from './fit-level';

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
  fit_level?: FitLevel;
  /** Likelihood of getting an interview/offer with a tailored resume (0–10, one decimal). */
  fit_score?: number;
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

export type InterviewQuestionCategory =
  | 'behavioral'
  | 'technical'
  | 'role_specific'
  | 'situational';

export type InterviewQuestion = {
  id: string;
  question: string;
  category: InterviewQuestionCategory;
  why_they_ask: string;
  framing_tips: string;
  sample_answer: string;
  strength_to_highlight?: string;
  weakness_to_address?: string;
};

export type InterviewPrepResult = {
  overview: string;
  questions: InterviewQuestion[];
};

export type InterviewPrepContext = {
  resumeText: string;
  job: { title: string; company: string | null; description: string };
  gapAnalysis?: GapAnalysis | null;
  priorAnswers?: TailorAnswer[];
  extraContext?: string;
};

export type InterviewQuestionAnswerResult = {
  talking_track: string;
  framing: string;
  evidence: string[];
  watch_outs?: string;
};

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured');
  return new Anthropic({ apiKey: key });
}

function getModel() {
  return process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
}

function getInterviewModel() {
  return process.env.ANTHROPIC_INTERVIEW_MODEL ?? 'claude-haiku-4-5-20251001';
}

function compactGapAnalysis(gap: GapAnalysis) {
  return {
    summary: gap.summary,
    fit_level: gap.fit_level,
    fit_score: gap.fit_score,
    strong_matches: gap.strong_matches.slice(0, 8),
    partial_matches: gap.partial_matches.slice(0, 6).map((m) => ({
      skill: m.skill,
      reframe_suggestion: m.reframe_suggestion,
    })),
    gaps: gap.gaps.slice(0, 8),
  };
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

async function claudeText(
  system: string,
  user: string,
  maxTokens = 8192,
  model?: string
): Promise<string> {
  const client = getClient();
  const response = await client.messages.create({
    model: model ?? getModel(),
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
- Set fit_score: a number from 0.0 to 10.0 (one decimal place, any tenth is allowed) for how likely the candidate is to get this job with a well-tailored resume. Rough guide: 0.0 = absurd long shot (e.g. CEO of an unrelated company); ~3–4 = long_shot; ~5–6 = stretch; ~7–8 = moderate; ~9–10 = strong / possibly overqualified — if they apply they should get it. Align score with fit_level but use the decimal to differentiate within a band.
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
2. Impact lines: lead with the quantified result, then the action that drove it — [Verb] + [result/metric] + [by/through action or context]. Put numbers near the front of the sentence, not buried at the end. Example: "Saved 700 labor hours and $2M annually by analyzing production workflows and capacity data to identify operational bottlenecks and implement scheduling improvements." NOT "Analyzed... implementing... that saved 700 labor hours and $2M annually."
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
        fit_score: 'number 0.0–10.0 with one decimal (likelihood of landing the job with a tailored resume)',
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

  const fitScore = normalizeFitScore(gap.fit_score);

  return {
    gap_analysis: {
      ...gap,
      fit_score: fitScore,
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

const COVER_LETTER_SYSTEM = `You are an expert career coach and cover letter writer with 15+ years of experience helping candidates land competitive roles.

Write a concise, professional cover letter tailored to THIS specific job and company.

Tone (critical):
- Confident, forward-looking, and enthusiastic — you are pitching the candidate, not auditing them.
- Lead with what they bring: relevant wins, transferable skills, and genuine interest in the role.
- NEVER apologize, disclaim, or call out missing requirements (e.g. do NOT write "I don't have X", "I will be upfront that I lack…", "While I haven't…", or similar admissions).
- If the fit is a stretch, stay positive: emphasize adjacent experience, learning agility, and motivation — without naming gaps or unmet requirements.
- Gap/mismatch notes in the input are for your awareness only so you do not invent credentials — never surface them in the letter.

Rules:
- ONE PAGE ONLY — target 250–400 words in the body (3–4 short paragraphs).
- Use standard business letter format: candidate name and contact info at top (extract from resume), date, company name, salutation, body, professional closing (e.g. "Sincerely,"), and typed name.
- First person throughout — write as the candidate ("I", "my", "me").
- Ground every claim in the resume and Q&A — NEVER invent employers, projects, degrees, or skills.
- Open with a specific hook: why THIS role at THIS company (not generic enthusiasm).
- Highlight 2–3 strongest, most relevant accomplishments that map to the job requirements.
- Mirror key language from the job description where truthful.
- Close with a confident call to action (e.g. look forward to discussing how your experience can contribute).
- Do NOT add markdown, code fences, commentary, or notes after the letter.
- Output the complete letter text only — ready to copy or print.`;

function compactCoverLetterContext(gap: GapAnalysis) {
  return {
    summary: gap.summary,
    fit_level: gap.fit_level,
    fit_score: gap.fit_score,
    strong_matches: gap.strong_matches.slice(0, 8),
    reframe_angles: gap.partial_matches.slice(0, 6).map((m) => ({
      skill: m.skill,
      angle: m.reframe_suggestion,
    })),
  };
}

export async function generateCoverLetter(
  resumeText: string,
  job: { title: string; company: string | null; description: string },
  gapAnalysis: GapAnalysis,
  answers: TailorAnswer[],
  options: Pick<GenerateOptions, 'extraContext'> = {}
): Promise<string> {
  const user = [
    `Job title: ${job.title}`,
    `Company: ${job.company ?? 'Unknown'}`,
    '',
    'Job description:',
    job.description.slice(0, 8000),
    '',
    'Candidate resume (source of truth for name, contact, and experience):',
    resumeText.slice(0, 8000),
    '',
    'Strengths and reframe angles (use for confident positioning — do NOT mention gaps or missing skills):',
    JSON.stringify(compactCoverLetterContext(gapAnalysis)),
    '',
    'Candidate Q&A (authoritative — do not go beyond these confirmations):',
    JSON.stringify(answers.slice(0, 12)),
    '',
    'Additional context from the candidate:',
    options.extraContext?.trim() || '(none provided)',
    '',
    'Write the one-page cover letter now. Confident tone throughout — no disclaimers about missing skills. Extract name and contact from the resume for the header.',
  ].join('\n');

  const text = await claudeText(COVER_LETTER_SYSTEM, user, 4096);
  if (!text) throw new Error('Empty cover letter response from AI');
  return text.trim();
}

const INTERVIEW_PREP_SYSTEM = `You are an expert interview coach helping a candidate prepare for a specific job interview.

Generate realistic interview questions they are likely to face for THIS role, paired with personalized answer guidance.

Rules:
- Speak directly TO the candidate using "you" and "your" — never third person.
- NEVER invent employers, projects, degrees, or skills not supported by the resume or prior answers.
- Ground sample answers in their actual background. When evidence is thin, suggest honest framing (transferable skills, learning plans) — do not fabricate.
- Include a mix: behavioral (STAR-style), role-specific, technical or skills-based (appropriate to the job), and situational.
- For each question, call out a strength to highlight when relevant, or a weakness/gap to address carefully when relevant.
- sample_answer should be 3–6 sentences — a concrete talking track, not bullet fragments.
- framing_tips: how to structure the answer (e.g. STAR, lead with outcome, acknowledge gap then pivot).
- Generate 6–8 questions total.
- Respond with a single JSON object only — no markdown fences.`;

export async function generateInterviewQuestions(
  context: InterviewPrepContext
): Promise<InterviewPrepResult> {
  const priorAnswers = (context.priorAnswers ?? []).slice(0, 12).map((a) => ({
    question: a.question ?? a.question_id,
    answer: a.answer.slice(0, 500),
    related_requirement: a.related_requirement ?? '',
  }));

  const userPrompt = JSON.stringify({
    job: {
      title: context.job.title,
      company: context.job.company,
      description: context.job.description.slice(0, 6000),
    },
    resume: context.resumeText.slice(0, 6000),
    gap_analysis: context.gapAnalysis ? compactGapAnalysis(context.gapAnalysis) : null,
    prior_answers: priorAnswers.length ? priorAnswers : null,
    extra_context: context.extraContext?.trim().slice(0, 1500) || null,
    output_schema: {
      overview: '2-3 sentences on interview focus areas for this role, speaking to the reader as "you"',
      questions: [
        {
          id: 'iq1',
          question: 'string',
          category: 'behavioral | technical | role_specific | situational',
          why_they_ask: 'string (use "you")',
          framing_tips: 'string (use "you")',
          sample_answer: 'string — first person implied, grounded in their background',
          strength_to_highlight: 'optional string',
          weakness_to_address: 'optional string',
        },
      ],
    },
  });

  const raw = await claudeText(
    INTERVIEW_PREP_SYSTEM,
    `Generate interview prep for this candidate and role. Return JSON with overview and 6–8 questions.\n\n${userPrompt}`,
    6000,
    getInterviewModel()
  );

  const parsed = parseJsonResponse<InterviewPrepResult>(raw);

  return {
    overview: directVoice(parsed.overview ?? '', context.resumeText),
    questions: (parsed.questions ?? []).slice(0, 8).map((q, i) => ({
      ...q,
      id: q.id || `iq${i + 1}`,
      question: directVoice(q.question, context.resumeText),
      why_they_ask: directVoice(q.why_they_ask, context.resumeText),
      framing_tips: directVoice(q.framing_tips, context.resumeText),
      sample_answer: directVoice(q.sample_answer, context.resumeText),
      strength_to_highlight: q.strength_to_highlight
        ? directVoice(q.strength_to_highlight, context.resumeText)
        : undefined,
      weakness_to_address: q.weakness_to_address
        ? directVoice(q.weakness_to_address, context.resumeText)
        : undefined,
    })),
  };
}

const INTERVIEW_ANSWER_SYSTEM = `You are an expert interview coach. The candidate pasted a question they were actually asked (or expect to be asked). Draft a spoken answer grounded ONLY in their resume, prior Q&A from resume tailoring, extra context they provided, and this job.

Rules:
- talking_track: first person as the candidate ("I", "my") — 4–8 conversational sentences they can say out loud. Use STAR (situation, task, action, result) when it fits. Include concrete names, metrics, and outcomes from the source material.
- framing: 1–3 sentences coaching THEM with "you" on how to structure and land the answer.
- evidence: 2–5 short phrases naming the resume / Q&A facts you used. If you used none, say so.
- watch_outs: optional. What to avoid (claiming a skill they don't have, rambling, underselling). Use "you".
- NEVER invent employers, titles, dates, projects, metrics, degrees, or skills.
- If they lack a direct example, give an honest adjacent story and a brief learning/pivot line — do not fabricate.
- Respond with a single JSON object only — no markdown fences.`;

export type InterviewAnswerRevision = {
  previous: InterviewQuestionAnswerResult;
  notes: string;
};

export type FollowUpContactRole = 'hiring_manager' | 'recruiter' | 'team_lead' | 'other';

export type FollowUpContactChannel = 'linkedin' | 'email' | 'other';

export type FollowUpContact = {
  id?: string;
  name: string;
  title: string;
  linkedin_url?: string;
  email?: string;
  email_confidence?: 'high' | 'medium' | 'low';
  email_pattern_note?: string;
  role_type: FollowUpContactRole;
  rationale: string;
  confidence: 'high' | 'medium' | 'low';
  company_evidence?: string;
  followed_up_at?: string;
  follow_up_channel?: FollowUpContactChannel;
  follow_up_notes?: string;
  connection_note?: string;
  follow_up_message?: string;
  source?: 'search' | 'manual';
};

export type FollowUpContactsResult = {
  overview: string;
  contacts: FollowUpContact[];
  connection_note: string;
  follow_up_message: string;
  company_email_domain?: string;
  email_pattern?: string;
};

export type FollowUpContactsContext = {
  resumeText: string;
  job: { title: string; company: string | null; description: string; url?: string | null };
  gapAnalysis?: GapAnalysis | null;
  searchResultsText: string;
  guessedEmailDomain?: string | null;
  /** primary = recruiters/hiring managers; adjacent = verified teammates in related roles */
  searchMode?: 'primary' | 'adjacent';
  excludeNames?: string[];
};

export type DraftFollowUpContactContext = {
  resumeText: string;
  job: { title: string; company: string | null; description: string; url?: string | null };
  gapAnalysis?: GapAnalysis | null;
  contact: FollowUpContact;
  extraContext?: string;
  revisionNotes?: string;
  currentDraft?: {
    connection_note?: string;
    follow_up_message?: string;
  };
};

const INTERVIEW_ANSWER_REVISE_SYSTEM = `You are an expert interview coach. The candidate already likes a drafted spoken answer and asked for a light edit.

Rules:
- Keep the same story, structure, length, and most of the wording.
- Apply ONLY the requested tweaks. Do not rewrite from scratch. Do not swap in a different example unless they asked.
- talking_track stays first person ("I", "my") and ready to say out loud.
- framing and watch_outs still coach THEM with "you".
- evidence should still name the resume / Q&A facts used.
- NEVER invent employers, titles, dates, projects, metrics, degrees, or skills.
- If a tweak would require invented experience, keep the original wording for that part and mention the limit in watch_outs.
- Respond with a single JSON object only — no markdown fences.`;

export async function answerInterviewQuestion(
  context: InterviewPrepContext,
  question: string,
  revision?: InterviewAnswerRevision
): Promise<InterviewQuestionAnswerResult> {
  const priorAnswers = (context.priorAnswers ?? []).slice(0, 16).map((a) => ({
    question: a.question ?? a.question_id,
    answer: a.answer.slice(0, 600),
    related_requirement: a.related_requirement ?? '',
  }));

  const userPrompt = JSON.stringify({
    interviewer_question: question.slice(0, 2000),
    revision_notes: revision?.notes.slice(0, 1500) || null,
    current_draft: revision
      ? {
          talking_track: revision.previous.talking_track.slice(0, 4000),
          framing: revision.previous.framing.slice(0, 1500),
          evidence: revision.previous.evidence.slice(0, 6),
          watch_outs: revision.previous.watch_outs?.slice(0, 1500) || null,
        }
      : null,
    job: {
      title: context.job.title,
      company: context.job.company,
      description: context.job.description.slice(0, 6000),
    },
    resume: context.resumeText.slice(0, 8000),
    gap_analysis: context.gapAnalysis ? compactGapAnalysis(context.gapAnalysis) : null,
    prior_answers: priorAnswers.length ? priorAnswers : null,
    extra_context: context.extraContext?.trim().slice(0, 1500) || null,
    output_schema: {
      talking_track: 'string — first person spoken answer',
      framing: 'string — coaching in "you"',
      evidence: ['string — fact used from resume or Q&A'],
      watch_outs: 'optional string — coaching in "you"',
    },
  });

  const raw = await claudeText(
    revision ? INTERVIEW_ANSWER_REVISE_SYSTEM : INTERVIEW_ANSWER_SYSTEM,
    revision
      ? `Revise this interview answer using only the candidate's notes. Keep it close to the current draft. Return JSON only.\n\n${userPrompt}`
      : `Draft an answer to this interviewer question. Return JSON only.\n\n${userPrompt}`,
    2500,
    getInterviewModel()
  );

  const parsed = parseJsonResponse<InterviewQuestionAnswerResult>(raw);
  const evidence = Array.isArray(parsed.evidence)
    ? parsed.evidence.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 6)
    : [];

  return {
    talking_track: (parsed.talking_track ?? '').trim(),
    framing: directVoice(parsed.framing ?? '', context.resumeText),
    evidence,
    watch_outs: parsed.watch_outs
      ? directVoice(parsed.watch_outs, context.resumeText)
      : undefined,
  };
}

const FOLLOW_UP_CONTACTS_SYSTEM = `You are a job-search strategist helping a candidate follow up after applying.

Given a job posting, the candidate's resume, and web search results, recommend specific people to reach out to on LinkedIn or email.

Rules:
- Pick REAL people whose names appear in the search results. Do NOT invent names.
- Prefer recruiters and hiring managers in the relevant team; include team leads when they clearly match the role.
- Deprioritize C-suite unless they directly own the function for this role.
- Skip people who clearly left the company or are unrelated to the posting.
- linkedin_url: use a URL from search results when available (linkedin.com/in/...). Omit if unsure.
- company_evidence: short quote from search results showing they work at the company (max ~200 chars).
- rationale: 2–3 sentences on why contact this person. Coach the candidate with "you".
- confidence: high if title/department match is exact; medium if plausible; low if uncertain.
- company_email_domain / email_pattern: only if clearly supported by search results; otherwise omit.
- Global connection_note and follow_up_message are optional templates — per-contact copy is drafted separately.
- overview: 1–2 sentences on overall outreach strategy.
- Respond with a single JSON object only — no markdown fences.`;

const DRAFT_FOLLOW_UP_CONTACT_SYSTEM = `You are a job-search coach drafting LinkedIn outreach for ONE specific contact.

Rules:
- connection_note: under 300 characters for a LinkedIn connection request. First person, specific to the role and this person.
- follow_up_message: 3–6 sentences for InMail or email if already connected. Reference the role and one real strength from the resume.
- Address the contact by first name when natural.
- NEVER invent employers, projects, or credentials.
- If revision_notes are provided, lightly edit the current draft — do not rewrite from scratch.
- Respond with a single JSON object only — no markdown fences.`;

function normalizeFollowUpRole(value: unknown): FollowUpContactRole {
  const roles = new Set<FollowUpContactRole>(['hiring_manager', 'recruiter', 'team_lead', 'other']);
  return roles.has(value as FollowUpContactRole) ? (value as FollowUpContactRole) : 'other';
}

function normalizeFollowUpConfidence(value: unknown): FollowUpContact['confidence'] {
  const levels = new Set(['high', 'medium', 'low']);
  return levels.has(String(value)) ? (value as FollowUpContact['confidence']) : 'medium';
}

function normalizeFollowUpContacts(
  contacts: FollowUpContact[] | undefined,
  resumeText: string
): FollowUpContact[] {
  return (contacts ?? [])
    .slice(0, 10)
    .map((c) => ({
      name: (c.name ?? '').trim(),
      title: (c.title ?? '').trim(),
      linkedin_url: c.linkedin_url?.trim() || undefined,
      email: c.email?.trim() || undefined,
      role_type: normalizeFollowUpRole(c.role_type),
      rationale: directVoice(c.rationale ?? '', resumeText),
      confidence: normalizeFollowUpConfidence(c.confidence),
      company_evidence: c.company_evidence?.trim().slice(0, 220) || undefined,
      source: 'search' as const,
    }))
    .filter((c) => c.name.length > 1 && c.title.length > 0);
}

export async function generateFollowUpContacts(
  context: FollowUpContactsContext
): Promise<FollowUpContactsResult> {
  const mode = context.searchMode ?? 'primary';
  const exclude = (context.excludeNames ?? []).map((n) => n.trim()).filter(Boolean);

  const userPrompt = JSON.stringify({
    search_mode: mode,
    exclude_names: exclude.length ? exclude : null,
    guessed_email_domain: context.guessedEmailDomain ?? null,
    job: {
      title: context.job.title,
      company: context.job.company,
      url: context.job.url ?? null,
      description: context.job.description.slice(0, 6000),
    },
    resume: context.resumeText.slice(0, 4000),
    gap_analysis: context.gapAnalysis ? compactGapAnalysis(context.gapAnalysis) : null,
    web_search_results: context.searchResultsText.slice(0, 12000),
    output_schema: {
      overview: 'string — outreach strategy, use "you"',
      contacts: [
        {
          name: 'string',
          title: 'string',
          linkedin_url: 'optional string',
          email: 'optional string — only if clearly in search results',
          role_type: 'hiring_manager | recruiter | team_lead | other',
          rationale: 'string',
          confidence: 'high | medium | low',
          company_evidence: 'optional string',
        },
      ],
      connection_note: 'optional string — global template under 300 chars',
      follow_up_message: 'optional string — global template',
      company_email_domain: 'optional string like company.com',
      email_pattern: 'optional string like first.last@company.com',
    },
  });

  const modeHint =
    mode === 'adjacent'
      ? 'Find additional teammates in adjacent roles who still work at the company. Skip people already listed in exclude_names.'
      : 'Prioritize recruiters and hiring managers for this exact role. Recommend up to 8 contacts when search results support them.';

  const raw = await claudeText(
    FOLLOW_UP_CONTACTS_SYSTEM,
    `${modeHint} Return JSON only.\n\n${userPrompt}`,
    4000,
    getInterviewModel()
  );

  const parsed = parseJsonResponse<FollowUpContactsResult>(raw);
  const contacts = normalizeFollowUpContacts(parsed.contacts, context.resumeText);

  return {
    overview: directVoice(parsed.overview ?? '', context.resumeText),
    contacts,
    connection_note: (parsed.connection_note ?? '').trim().slice(0, 300),
    follow_up_message: (parsed.follow_up_message ?? '').trim(),
    company_email_domain:
      parsed.company_email_domain?.trim() || context.guessedEmailDomain?.trim() || undefined,
    email_pattern: parsed.email_pattern?.trim() || undefined,
  };
}

export async function draftFollowUpContactMessage(
  context: DraftFollowUpContactContext
): Promise<{ connection_note: string; follow_up_message: string }> {
  const firstName = context.contact.name.split(/\s+/)[0] ?? 'there';
  const userPrompt = JSON.stringify({
    contact: {
      name: context.contact.name,
      title: context.contact.title,
      role_type: context.contact.role_type,
      linkedin_url: context.contact.linkedin_url ?? null,
      email: context.contact.email ?? null,
      rationale: context.contact.rationale,
    },
    job: {
      title: context.job.title,
      company: context.job.company,
      description: context.job.description.slice(0, 4000),
    },
    resume: context.resumeText.slice(0, 4000),
    gap_analysis: context.gapAnalysis ? compactGapAnalysis(context.gapAnalysis) : null,
    extra_context: context.extraContext?.trim().slice(0, 1500) || null,
    revision_notes: context.revisionNotes?.trim().slice(0, 1500) || null,
    current_draft: context.currentDraft ?? null,
    output_schema: {
      connection_note: `string — under 300 chars, first person, address ${firstName} naturally`,
      follow_up_message: 'string — 3–6 sentences, first person',
    },
  });

  const raw = await claudeText(
    DRAFT_FOLLOW_UP_CONTACT_SYSTEM,
    context.revisionNotes
      ? `Revise the outreach draft for this contact. Return JSON only.\n\n${userPrompt}`
      : `Draft outreach for this contact. Return JSON only.\n\n${userPrompt}`,
    2000,
    getInterviewModel()
  );

  const parsed = parseJsonResponse<{ connection_note?: string; follow_up_message?: string }>(raw);
  return {
    connection_note: (parsed.connection_note ?? '').trim().slice(0, 300),
    follow_up_message: (parsed.follow_up_message ?? '').trim(),
  };
}
