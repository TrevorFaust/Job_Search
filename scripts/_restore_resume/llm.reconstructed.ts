import Anthropic from '@anthropic-ai/sdk';
import { applyLockedStructure, countResumeBullets, preserveIdentityFields, serializeResumeOutput } from './resume-draft';
import { fitResumeToPage } from './resume-fit';
import { measureResumeDraft, capSkillGroupsToLines } from './resume-pdf';
import {
  addressCandidateDirectly,
  extractResumeStructure,
  stripEmDashes,
  type ResumeFormatMeta,
} from './resume-structure';
import { coverLetterDate, normalizeCoverLetterBody } from './cover-letter';
import { FILL_IF_SLACK_PT, type ResumeDraft, type ResumeSessionOutput } from './resume-template';
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
  previousDraft?: ResumeDraft | null;
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

const PUNCTUATION_RULE = `PUNCTUATION (hard, non-negotiable):
- NEVER use em dashes, en dashes, or minus-as-dash characters (—, –, ―, −).
- NEVER use a double hyphen as a dash ( -- ).
- Use a comma, a period, a colon, or the word "to" instead.
- ASCII hyphen is allowed only in dates and compound words (Feb 2021-Present, Power BI, well-known).`;

const GENERATE_SYSTEM = `You are an expert resume writer filling Trevor Faust's locked one-page template. Output JSON only.

- Header and education start from the template. Do not emit them in JSON. The user may edit those lines later.
- First job is always Kennametal, Seattle, WA / Pittsburgh, PA / Solon, OH (Feb 2021-Present)
- First role under Kennametal is always "Regional Channel Representative" (bullets vary)
- Section order: Profile → Education → Professional Experience → Data & Analytics Projects → Relevant Skills
- Skills: exactly TWO groups, items joined later with " | ", both groups centered

${PUNCTUATION_RULE}

Trevor's own one-pagers are DENSE. They fill the sheet to about 0.4" from the bottom. A short resume is a failed draft. 45 lines is fine if they fill the page. Empty space under skills is a failure.

Default packed page (use this unless the job is purely product/design and projects need the room):
- profile: 2-3 sentences wrapping to 4-5 lines. Not 5+ sentences. Implied first person (no "I"). Last sentence can hook the employer.
- Channel Rep: 5-6 bullets. Most bullets wrap to 2 lines. Mark the weakest (often customer retention) cutFirst: true.
- Process Engineer: INCLUDE by default with 3 bullets ($2M / 700 hours, Excel/VBA scheduling, proposal/stakeholder). Omit only for product/design/frontend-heavy roles where projects should go deeper instead.
- Extra employers: ONLY if clearly relevant (Penn State energy research for energy roles).
- projects: 1-2 projects typical; the primary one (DraftDNA / NFL platform) gets 4-5 bullets. A second project (newsletter, job-board tooling) gets 2-3 when it maps to the JD.
- Prefer extra bullets that prove depth for THIS job: methods, stakeholders, scale, tools used in context. Do not invent metrics.
- Project titles are italic AND underlined. Put the URL on the SAME line as the title, e.g. "NFL Data Platform & Mock Draft Simulator (draftdna.com)". Do NOT emit a subtitle field. Do NOT put stack on its own line (no "draftdna.com, Python, PostgreSQL, ..."). If the JD cares about the stack, one bullet may name Python, PostgreSQL, Supabase, React, TypeScript, Tailwind.
- skills: exactly TWO groups. Keep a solid tool list, but each group's items (joined with " | ") must wrap to AT MOST 2 lines. Headings do not count. About 6-9 concise tools per group is typical; never a keyword dump.
- Do NOT stuff job-description keywords into Relevant Skills. Mirror JD language in profile, experience bullets, and project bullets where it is true. Skills are an inventory of tools Trevor actually uses, ordered with the most relevant first.
- If the page has room, expand Channel Rep, Process Engineer, or projects. Never grow skills past 2 lines to fill space.
- Each bullet: NO leading dash. Lead with the quantified result when one exists, then the action. Vary verbs. Never invent employers, titles, dates, degrees, or metrics.

Do NOT write a sparse resume. Empty space under skills means you omitted Process Engineer, a project, or bullets you should have kept. Put cutFirst on extras rather than leaving them out.

Voice: Power BI, team of 7, 20% retention, $2M / 700 labor hours, 200M+ records, 400+ draft badges, 32 NFL teams. No "results-oriented" fluff.

Respond with a single JSON object only. No markdown fences, no resume header/education text.`;

const FILL_SYSTEM = `You densify an existing tailored resume JSON so it fills one US Letter page. Output JSON only.

${PUNCTUATION_RULE}

- Keep the same header and education text. Do not rewrite name, contact, or school lines.
- Keep profile at 2-3 sentences wrapping to about 4-5 lines. Do not add a fourth sentence.
- No project subtitle. DraftDNA title must include (draftdna.com) on the same line.
- Tech stack is not its own line. Include it as a bullet only if the job posting cares about those tools.
- Do NOT add skills items to fill the page. Each skills group must stay at most 2 wrapped lines. Leave skills as they are unless they already overflow, in which case cut trailing tools.
- ADD 1-2 NEW bullets. Keep existing bullets. Each new bullet should wrap to about 2 lines.
- New bullets must increase credibility for THIS job: a method, tool-in-context, stakeholder, scale, or quantified outcome from the master resume that maps to the posting. Prefer Channel Rep, Process Engineer, or the primary project. Never invent employers, titles, dates, or metrics.
- Mark newly added bullets cutFirst: true.
- Return the full draft JSON: profile, experience, projects, skills. Do not return keywordAlignment.

The page currently has leftover space. Add the requested number of new bullets.`;

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
    'Master resume (source library — curate, do not transcribe):',
    resumeText.slice(0, 10000),
    '',
    'original_structure (ignore layout; content only):',
    JSON.stringify(formatMeta),
    '',
    'Gap analysis:',
    JSON.stringify(compactGapAnalysis(gapAnalysis)),
    '',
    'Candidate Q&A (authoritative — do not go beyond these confirmations):',
    JSON.stringify(answers),
    '',
    'Additional context from the candidate:',
    options.extraContext?.trim() || '(none provided)',
    '',
    'Return JSON with this shape:',
    JSON.stringify({
      profile: '2-3 sentences wrapping to 4-5 lines, no I, no em dashes, tailored to this job',
      experience: [
        {
          company: 'Kennametal',
          locationDates: ', Seattle, WA / Pittsburgh, PA / Solon, OH  (Feb 2021-Present)',
          roles: [
            {
              title: 'Regional Channel Representative',
              bullets: [{ text: 'accomplishment without leading dash', cutFirst: false }],
            },
            {
              title: 'Process Engineer',
              bullets: [{ text: 'optional role', cutFirst: false }],
            },
          ],
        },
      ],
      projects: [
        {
          title: 'NFL Data Platform & Mock Draft Simulator (draftdna.com)',
          bullets: [{ text: 'accomplishment. Stack only here if relevant to the JD.', cutFirst: false }],
        },
      ],
      skills: [
        { heading: 'Data & Analytic Tools', items: ['Power BI', 'Python'] },
        { heading: 'Data Analysis', items: ['Forecasting', 'Data Storytelling'] },
      ],
      keywordAlignment: [{ term: 'JD keyword', status: 'Yes | Partial | Gap' }],
    }),
    '',
    'Write a FULL one-page resume JSON now. Always include Kennametal + Regional Channel Representative. Default to also including Process Engineer. Pack the page with experience and project bullets, not a bloated skills list. Channel Rep 5-6 bullets, Process Engineer 3, primary project 4-5. Skills: two groups, each at most 2 wrapped lines, relevant tools first. No subtitle line. No em dashes. JSON only.',
  ].join('\n');

  const text = await claudeText(GENERATE_SYSTEM, user, 12000);
  if (!text) throw new Error('Empty response from AI');

  const parsed = parseJsonResponse<{
    profile?: string;
    experience?: ResumeDraft['experience'];
    projects?: ResumeDraft['projects'];
    skills?: ResumeDraft['skills'];
    keywordAlignment?: ResumeSessionOutput['keywordAlignment'];
  }>(text);

  let draft = preserveIdentityFields(
    capSkillGroupsToLines(
      applyLockedStructure({
        header: options.previousDraft?.header,
        education: options.previousDraft?.education,
        profile: parsed.profile ?? '',
        experience: parsed.experience ?? [],
        projects: parsed.projects ?? [],
        skills: parsed.skills ?? [],
      })
    ),
    options.previousDraft
  );

  if (pageLength === 'one') {
    let layout = measureResumeDraft(draft);
    if (!layout.fits) {
      draft = fitResumeToPage(draft).draft;
      layout = measureResumeDraft(draft);
    }
    for (let pass = 0; pass < 3 && layout.fits && layout.slackPt > FILL_IF_SLACK_PT; pass++) {
      const extraBullets = Math.max(1, Math.min(2, Math.round(layout.slackPt / 26)));
      const before = countResumeBullets(draft);
      draft = capSkillGroupsToLines(
        await expandResumeDraft(draft, resumeText, job, extraBullets)
      );
      layout = measureResumeDraft(draft);
      if (countResumeBullets(draft) <= before && layout.slackPt > FILL_IF_SLACK_PT) {
        continue;
      }
      if (!layout.fits) {
        draft = fitResumeToPage(draft).draft;
        break;
      }
    }
  }

  const output: ResumeSessionOutput = {
    version: 1,
    draft,
    keywordAlignment: (Array.isArray(parsed.keywordAlignment) ? parsed.keywordAlignment : []).map((item) => ({
      term: item.term,
      status: item.status,
    })),
  };
  return serializeResumeOutput(output);
}

async function expandResumeDraft(
  draft: ResumeDraft,
  resumeText: string,
  job: { title: string; company: string | null; description: string },
  extraBullets: number
): Promise<ResumeDraft> {
  const user = [
    `Add ${extraBullets} NEW bullet${extraBullets === 1 ? '' : 's'} (about 2 wrapped lines each) so the page is full.`,
    'Keep every existing bullet. New bullets should prove depth for this job (method, tool in context, stakeholders, or scale) using only facts from the master resume.',
    `Job title: ${job.title}`,
    `Company: ${job.company ?? 'Unknown'}`,
    '',
    'Job description:',
    job.description.slice(0, 6000),
    '',
    'Master resume (source library; curate, do not invent):',
    resumeText.slice(0, 8000),
    '',
    'Current draft JSON:',
    JSON.stringify(draft),
    '',
    'Return the full denser draft JSON only.',
  ].join('\n');

  try {
    const text = await claudeText(FILL_SYSTEM, user, 8000);
    const parsed = parseJsonResponse<{
      header?: ResumeDraft['header'];
      education?: ResumeDraft['education'];
      profile?: string;
      experience?: ResumeDraft['experience'];
      projects?: ResumeDraft['projects'];
      skills?: ResumeDraft['skills'];
    }>(text);
    return capSkillGroupsToLines(
      applyLockedStructure({
        header: parsed.header ?? draft.header,
        education: parsed.education ?? draft.education,
        profile: parsed.profile ?? draft.profile,
        experience: parsed.experience ?? draft.experience,
        projects: parsed.projects ?? draft.projects,
        skills: parsed.skills ?? draft.skills,
      })
    );
  } catch {
    return draft;
  }
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
- Do NOT include letterhead (name, location, email, phone, LinkedIn, GitHub, website). The template already prints those three header lines.
- Do NOT include a date line. Today's date is inserted automatically when the letter is saved as a PDF.
- Start with the company name (optional) and then the salutation (e.g. "Dear Hiring Manager,") on its own line.
- Put a blank line after the salutation, then the body (3–4 short paragraphs with a blank line between each).
- Put a blank line before the closing. Then:
Sincerely,
Trevor Faust
- "Trevor Faust" goes on the line immediately after "Sincerely,". No blank line between them, and never on the same line.
- NEVER continue the first body sentence on the salutation line.
- ONE PAGE ONLY. Target 250–400 words in the body (3–4 short paragraphs).
- First person throughout — write as the candidate ("I", "my", "me").
- Ground every claim in the resume and Q&A — NEVER invent employers, projects, degrees, or skills.
- Open with a specific hook: why THIS role at THIS company (not generic enthusiasm).
- Highlight 2–3 strongest, most relevant accomplishments that map to the job requirements.
- Mirror key language from the job description where truthful.
- Close with a confident call to action (e.g. look forward to discussing how your experience can contribute).
- Do NOT add markdown, code fences, commentary, or notes after the letter.
- NEVER use em dashes, en dashes, or " -- " as a dash. Use a comma, a period, or "to".
- Output the complete letter text only, ready to copy or print.`;

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
    'Candidate resume (source of truth for experience — do not copy the header into the letter):',
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
    `Today's date is ${coverLetterDate()}. Never write a date line or a different current year.`,
    'Write the letter body now. Start at the company name or salutation. No letterhead, no date. Confident tone throughout — no disclaimers about missing skills.',
  ].join('\n');

  const text = await claudeText(COVER_LETTER_SYSTEM, user, 4096);
  if (!text) throw new Error('Empty cover letter response from AI');
  return normalizeCoverLetterBody(text);
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
