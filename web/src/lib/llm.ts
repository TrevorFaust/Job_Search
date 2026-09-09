import Anthropic from '@anthropic-ai/sdk';
import {
  applyLockedStructure,
  countResumeBullets,
  preserveIdentityFields,
  serializeResumeOutput,
} from './resume-draft';
import { fitResumeToPage } from './resume-fit';
import { measureResumeDraft, capSkillGroupsToLines } from './resume-pdf';
import {
  addressCandidateDirectly,
  extractResumeStructure,
  type ResumeFormatMeta,
} from './resume-structure';
import { coverLetterDate, normalizeCoverLetterBody } from './cover-letter';
import { FILL_IF_SLACK_PT, type ResumeDraft, type ResumeSessionOutput } from './resume-template';
import { CANDIDATE_FACTS } from './candidate-facts';
import { normalizeFitScore } from './fit-level';
import type { FitLevel } from './fit-level';
import type { AtsAudit, AtsFinding, AtsSoftBlocker } from './ats-audit';

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
  revisionNotes?: string;
  /** Skip the post-generate expand/fill LLM passes (use for targeted ATS patches). */
  skipFillPasses?: boolean;
};

const MAX_ATS_QUESTIONS = 5;

export type CoverLetterOptions = {
  extraContext?: string;
  previousBody?: string;
  revisionNotes?: string;
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

Ask clarifying questions only when a fact is missing from the resume AND prior_answers. Default to 0–2 questions. Never more than 3.

Each question must be ONE short sentence (under 140 characters). No preamble, no coaching, no examples, no "walk me through".
Good: "Have you used Figma, even for a mockup or tutorial?"
Bad: a paragraph that explains the job, then asks.

Only ask about this posting's unique gaps (a named tool, license, location constraint, or metric not already covered). Do NOT re-ask career narrative, motivation, "why this role", availability vs current job, or generic data/SQL/pipeline/design questions if prior_answers already touch that topic.

suggested_answers: 2–4 chips, each 1–4 words (Yes, No, Adjacent experience).
Zero questions is the correct output when prior_answers already cover the gaps.
If known_project_details cover a topic, you may still ask a short question; a draft answer will be prefilled for review. Do not contradict those notes.
${VOICE_RULES}

Other rules:
- NEVER invent experience for the candidate.
- Note honest reframing angles even for stretch roles.
- Set fit_level: strong | moderate | stretch | long_shot.
- Set fit_score: a number from 0.0 to 10.0 (one decimal place, any tenth is allowed) for how likely the candidate is to get this job with a well-tailored resume. Rough guide: 0.0 = absurd long shot (e.g. CEO of an unrelated company); ~3–4 = long_shot; ~5–6 = stretch; ~7–8 = moderate; ~9–10 = strong / possibly overqualified — if they apply they should get it. Align score with fit_level but use the decimal to differentiate within a band.
- If prior_answers are provided, do NOT re-ask similar questions even if the wording would be different.
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
- Project titles are italic AND underlined. Put the URL on the SAME line as the title, e.g. "NFL Data Platform (draftdna.com)". Title it as the NFL data platform only — do NOT put "Mock Draft Simulator" in the project title (mock draft can be one bullet if relevant). Newsletter / job-board tooling stays a separate second project when it maps to the JD. Do NOT emit a subtitle field. Do NOT put stack on its own line (no "draftdna.com, Python, PostgreSQL, ..."). If the JD cares about the stack, one bullet may name Python, PostgreSQL, Supabase, React, TypeScript, Tailwind.
- skills: exactly TWO groups. Keep a solid tool list, but each group's items (joined with " | ") must wrap to AT MOST 2 lines. Headings do not count. About 6-9 concise tools per group is typical; never a keyword dump.
- Do NOT stuff job-description keywords into Relevant Skills. Mirror JD language in profile, experience bullets, and project bullets where it is true. Skills are an inventory of tools Trevor actually uses, ordered with the most relevant first.
- If the page has room, expand Channel Rep, Process Engineer, or projects. Never grow skills past 2 lines to fill space.
- Each bullet: NO leading dash. Lead with the quantified result when one exists, then the action. Vary verbs. Never invent employers, titles, dates, degrees, or metrics.

Do NOT write a sparse resume. Empty space under skills means you omitted Process Engineer, a project, or bullets you should have kept. Put cutFirst on extras rather than leaving them out.

Voice: Power BI, team of 7, 20% retention, $2M / 700 labor hours, 200M+ records, 400+ draft badges, 32 NFL teams. No "results-oriented" fluff.

Respond with a single JSON object only. No markdown fences, no resume header/education text.`;

const REVISE_GENERATE_SYSTEM = `You revise an existing tailored resume JSON based on the candidate's feedback. Output JSON only.

- Start from current_draft. Apply ONLY the requested changes — do not rewrite from scratch unless they asked.
- Keep bullets, sections, and wording that still work. Preserve the same one-page density unless they ask to shorten.
- Header and education are locked. Do not emit them in JSON.
- Same Kennametal structure, section order, and skills rules as the original tailored resume.
- Keep profile short: 2-3 sentences, at most 4-5 wrapped lines. Prefer experience/project bullets for new evidence — never balloon the profile.
- NEVER invent employers, titles, dates, degrees, metrics, or skills.
- If a requested change would require invented experience, keep the original wording for that part.

${PUNCTUATION_RULE}

Respond with a single JSON object only. No markdown fences, no resume header/education text.`;

const FILL_SYSTEM = `You densify an existing tailored resume JSON so it fills one US Letter page. Output JSON only.

${PUNCTUATION_RULE}

- Keep the same header and education text. Do not rewrite name, contact, or school lines.
- Keep profile at 2-3 sentences wrapping to about 4-5 lines. Do not add a fourth sentence.
- NEVER expand the profile past 4-5 lines. Prefer putting new evidence in experience/project bullets, not the profile.
- No project subtitle. DraftDNA title is "NFL Data Platform (draftdna.com)" on the same line — never "Mock Draft Simulator" in the title.
- Tech stack is not its own line. Include it as a bullet only if the job posting cares about those tools.
- Do NOT add skills items to fill the page. Each skills group must stay at most 2 wrapped lines. Leave skills as they are unless they already overflow, in which case cut trailing tools.
- ADD 1-2 NEW bullets. Keep existing bullets. Each new bullet should wrap to about 2 lines.
- New bullets must increase credibility for THIS job: a method, tool-in-context, stakeholder, scale, or quantified outcome from the master resume that maps to the posting. Prefer Channel Rep, Process Engineer, or the primary project. Never invent employers, titles, dates, or metrics.
- Mark newly added bullets cutFirst: true.
- Return the full draft JSON: profile, experience, projects, skills. Do not return keywordAlignment.

The page currently has leftover space. Add the requested number of new bullets.`;

const MAX_CLARIFYING_QUESTIONS = 3;
const MAX_QUESTION_CHARS = 180;

function compactPriorAnswers(priorAnswers: TailorAnswer[]) {
  return priorAnswers.slice(0, 50).map((a) => ({
    topic: (a.related_requirement || a.question || '').slice(0, 140),
    answer: a.answer.slice(0, 220),
  }));
}

function compactClarifyingQuestion(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length <= MAX_QUESTION_CHARS) return cleaned;

  const sentences = (cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned])
    .map((s) => s.trim())
    .filter(Boolean);
  const withMark = sentences.filter((s) => s.includes('?'));
  const pick = withMark[withMark.length - 1] ?? sentences[sentences.length - 1] ?? cleaned;
  if (pick.length <= 220) return pick;
  return `${pick.slice(0, 200).replace(/\s+\S*$/, '')}…`;
}

function compactSuggestedAnswers(answers: string[] | undefined): string[] | undefined {
  const chips = (answers ?? [])
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((s) => (s.length > 40 ? `${s.slice(0, 37).trim()}…` : s))
    .slice(0, 4);
  return chips.length ? chips : undefined;
}

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
    prior_answers: compactPriorAnswers(priorAnswers),
    known_project_details: CANDIDATE_FACTS.map((f) => ({
      topic: f.id,
      answer: f.answer,
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
          question: 'one short sentence, under 140 characters, address reader as "you"',
          context: 'omit or one short clause',
          related_requirement: 'string',
          suggested_answers: ['Yes', 'No'],
        },
      ],
    },
  });

  const raw = await claudeText(
    ANALYZE_SYSTEM,
    `Analyze this resume against the job. Return JSON with gap_analysis and 0–3 short new questions (0 if prior_answers already cover it).\n\n${userPrompt}`
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
    questions: (parsed.questions ?? []).slice(0, MAX_CLARIFYING_QUESTIONS).map((q, i) => ({
      ...q,
      id: q.id || `q${i + 1}`,
      question: compactClarifyingQuestion(directVoice(q.question, resumeText)),
      context: '',
      suggested_answers: compactSuggestedAnswers(q.suggested_answers),
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
  const revising = !!(options.revisionNotes?.trim() && options.previousDraft);

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
    ...(revising
      ? [
          'Current tailored draft (revise this — do not start over unless asked):',
          JSON.stringify({
            profile: options.previousDraft!.profile,
            experience: options.previousDraft!.experience,
            projects: options.previousDraft!.projects,
            skills: options.previousDraft!.skills,
          }),
          '',
          'Revision notes from the candidate:',
          options.revisionNotes!.trim().slice(0, 1500),
          '',
        ]
      : []),
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
          title: 'NFL Data Platform (draftdna.com)',
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
    revising
      ? 'Revise the current draft per the notes. Return the full updated resume JSON only.'
      : 'Write a FULL one-page resume JSON now. Always include Kennametal + Regional Channel Representative. Default to also including Process Engineer. Pack the page with experience and project bullets, not a bloated skills list. Channel Rep 5-6 bullets, Process Engineer 3, primary project 4-5. Skills: two groups, each at most 2 wrapped lines, relevant tools first. No subtitle line. No em dashes. JSON only.',
  ].join('\n');

  const text = await claudeText(revising ? REVISE_GENERATE_SYSTEM : GENERATE_SYSTEM, user, 12000);
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
    if (!options.skipFillPasses) {
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
  }

  const output: ResumeSessionOutput = {
    version: 1,
    draft,
    keywordAlignment: (Array.isArray(parsed.keywordAlignment) ? parsed.keywordAlignment : []).map(
      (item) => ({
        term: item.term,
        status: item.status,
      })
    ),
  };
  return serializeResumeOutput(output);
}

const ATS_AUDIT_SYSTEM = `You are a strict ATS + recruiter screen auditor AND a careful resume editor.

Score like a modern ATS plus a 30-second human skim. Weight evidence and context more than keyword stuffing:
- ~55% evidence strength (bullets show ownership, tools in context, outcomes mapped to JD needs)
- ~25% requirement coverage (skills/tools/domain present where truthful)
- ~20% parse/scan clarity (titles, skills section, JD language mirrored when honest)

CEILING vs SCORE (critical):
- ceiling = the honest maximum for THIS candidate with known facts (soft blockers already baked in).
- After you apply every safe patch, score MUST equal ceiling (or differ by at most 1).
- NEVER leave score below ceiling with "do these edits to get there" homework. If 85 is reachable honestly, the patched draft must score ~85 now.
- If you cannot honestly reach a number, LOWER the ceiling to what the patched draft actually earns. Do not advertise an unreachable ceiling.

Rules:
- NEVER invent employers, tools, degrees, certifications, or years of experience.
- Soft blockers (years of experience, degrees, exact titles the candidate lacks) CAP the ceiling but do NOT invent claims.
- Be aggressive about rephrasing EXISTING facts to surface buried keywords and stronger evidence — only from the tailored draft + master resume + Q&A.
- PUSH TO THE HONEST CEILING IN ONE PASS. In patched_draft, implement every safe improvement (reorder bullets, sharpen outcomes, mirror JD language, surface buried tools). Prefer experience and project bullets for new evidence.
- PROFILE HARD LIMIT: 2-3 sentences, at most 4-5 wrapped lines (~480 characters). Never expand the profile to absorb ATS keywords — put those in bullets/skills instead. If the current profile is already long, shorten it while patching.
- path_to_target: only what would be needed to break ABOVE the ceiling (usually new real experience the candidate does not have yet) — not edits you could still make to reach the ceiling.
- When safe patches exist, return patched_draft: the FULL updated resume sections (profile, experience, projects, skills) with targeted edits applied. Do not rewrite from scratch. If no safe patches, set patched_draft to null and set score = ceiling for the current draft.
- auto_patch_notes: short list of what you changed in patched_draft. Empty if patched_draft is null.
- questions: 0–5 SHORT questions (under 120 chars). Prefer yes/no or chip answers. ONLY ask when a missing fact could raise the ceiling itself. If prior_ats_answers or prior_rebuttals already cover a topic, do NOT re-ask it — questions must be []. suggested_answers: 2–4 chips of 1–4 words.
- findings / soft_blockers: omit anything the candidate already rebutted or answered. Prefer empty arrays when prior_rebuttals / prior_ats_answers exist unless a brand-new gap appears.
- score: screenability of the draft you return (patched if present) — integer 0–100. Must match ceiling after patches.
- score_before_patches: score of the original draft before your edits (omit if no patches).
- ceiling: honest max = score of the best honest patched draft (0–100).
- Speak TO the candidate with "you"/"your".
- JSON only. No markdown fences.`;

const ATS_APPLY_SYSTEM = `You apply the candidate's ATS follow-up answers and rebuttals (to findings AND soft blockers) to an existing tailored resume, then re-score it.

CEILING vs SCORE (critical):
- After this pass, score MUST equal ceiling (or differ by at most 1).
- Push every honest improvement now. Do not leave a gap between score and ceiling.
- If something is unreachable honestly, lower the ceiling — do not keep score below an inflated ceiling.

Rules:
- Start from current_draft. Apply ONLY targeted patches — do not rewrite the whole resume.
- NEVER invent employers, tools, degrees, certifications, or years of experience.
- If an answer/rebuttal is No / n/a / Skip / empty, do not add that skill or claim.
- If they rebut a "missing" finding with real experience, weave that into bullets/skills honestly using their words + master resume.
- If they rebut a soft blocker (e.g. years/degree) with clarifying facts, raise the ceiling when justified, drop or soften that blocker, and surface the clarified experience on the resume when truthful.
- PUSH TO THE HONEST CEILING IN THIS ONE PASS.
- PROFILE HARD LIMIT: 2-3 sentences, at most 4-5 wrapped lines. Do not grow the profile; put new evidence in experience/project bullets.
- path_to_target: only what would break ABOVE the new ceiling (new experience they still lack) — not remaining edits to reach the ceiling.
- Return the full updated draft sections plus a fresh ATS audit of the UPDATED draft.
- findings, soft_blockers, and questions MUST be empty arrays [] after this pass (follow-ups are closed). Put residual explanation in evidence_notes, path_to_target, and ceiling_reasons only.
- Speak TO the candidate with "you"/"your".
- JSON only. No markdown fences.
- NEVER use em dashes or en dashes.`;

function clampScore(n: unknown, fallback = 0): number {
  const num = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function normalizeAtsQuestions(
  questions: TailorQuestion[] | undefined,
  resumeText: string,
  max = MAX_ATS_QUESTIONS
) {
  return (questions ?? [])
    .slice(0, max)
    .map((q, i) => ({
      id: q.id?.trim() || `ats_q${i + 1}`,
      question: directVoice(String(q.question ?? '').trim(), resumeText).slice(0, 160),
      context: String(q.context ?? '').trim().slice(0, 240),
      related_requirement: String(q.related_requirement ?? '').trim().slice(0, 120),
      suggested_answers: (q.suggested_answers ?? [])
        .map((a) => String(a).trim())
        .filter(Boolean)
        .slice(0, 4),
    }))
    .filter((q) => q.question.length > 0);
}

function normalizeAtsFindings(
  findings: Array<Partial<AtsFinding> & { id?: string }> | undefined,
  resumeText: string
): AtsFinding[] {
  return (findings ?? []).slice(0, 8).map((f, i) => ({
    id: String(f.id ?? `f${i + 1}`).trim() || `f${i + 1}`,
    area: String(f.area ?? 'general').trim(),
    severity: f.severity === 'high' || f.severity === 'low' ? f.severity : 'medium',
    issue: directVoice(String(f.issue ?? '').trim(), resumeText),
    fix: directVoice(String(f.fix ?? '').trim(), resumeText),
  }));
}

function normalizeAtsAuditFields(
  parsed: {
    score?: number;
    score_before_patches?: number;
    ceiling?: number;
    ceiling_reasons?: string[];
    path_to_target?: string;
    evidence_notes?: string;
    findings?: Array<Partial<AtsFinding> & { id?: string }>;
    soft_blockers?: AtsSoftBlocker[];
    auto_patch_notes?: string[];
    questions?: TailorQuestion[];
  },
  resumeText: string,
  extras: Partial<AtsAudit> = {}
): AtsAudit {
  let score = clampScore(parsed.score, 0);
  const before = parsed.score_before_patches != null ? clampScore(parsed.score_before_patches, score) : undefined;
  let ceiling = clampScore(parsed.ceiling, score);
  const patches = (parsed.auto_patch_notes ?? [])
    .map((n) => String(n).trim())
    .filter(Boolean)
    .slice(0, 8);

  // After honest patches, score should match ceiling (ceiling already includes soft blockers).
  // Prefer reporting the reached ceiling over leaving a false "gap to your own ceiling."
  if (score > ceiling) ceiling = score;
  else if (patches.length > 0 && ceiling > score) score = ceiling;

  return {
    score,
    score_before_patches: before,
    ceiling,
    ceiling_reasons: (parsed.ceiling_reasons ?? []).map((r) => String(r).trim()).filter(Boolean).slice(0, 6),
    path_to_target: directVoice(
      String(parsed.path_to_target ?? '').trim() ||
        'Push evidence in bullets that already match the JD; do not invent tools or jobs.',
      resumeText
    ),
    evidence_notes: directVoice(String(parsed.evidence_notes ?? '').trim(), resumeText),
    findings: normalizeAtsFindings(parsed.findings, resumeText),
    soft_blockers: (parsed.soft_blockers ?? []).slice(0, 6).map((b, i) => ({
      id: String((b as { id?: string }).id ?? `b${i + 1}`).trim() || `b${i + 1}`,
      requirement: String(b.requirement ?? '').trim(),
      reason: directVoice(String(b.reason ?? '').trim(), resumeText),
      honest_approach: directVoice(String(b.honest_approach ?? '').trim(), resumeText),
    })),
    auto_patches_applied: patches,
    questions: normalizeAtsQuestions(parsed.questions, resumeText),
    audited_at: new Date().toISOString(),
    ...extras,
  };
}

function applyPatchedSections(
  draft: ResumeDraft,
  patched: {
    profile?: string;
    experience?: ResumeDraft['experience'];
    projects?: ResumeDraft['projects'];
    skills?: ResumeDraft['skills'];
  } | null | undefined
): ResumeDraft | null {
  if (!patched || typeof patched !== 'object') return null;
  if (!patched.profile && !patched.experience && !patched.projects && !patched.skills) return null;
  return preserveIdentityFields(
    capSkillGroupsToLines(
      applyLockedStructure({
        header: draft.header,
        education: draft.education,
        profile: patched.profile ?? draft.profile,
        experience: patched.experience ?? draft.experience,
        projects: patched.projects ?? draft.projects,
        skills: patched.skills ?? draft.skills,
      })
    ),
    draft
  );
}

export async function auditTailoredResumeForAts(
  draft: ResumeDraft,
  resumeText: string,
  job: { title: string; company: string | null; description: string },
  answers: TailorAnswer[],
  priorAtsAnswers: TailorAnswer[] = [],
  priorRebuttals: Array<{ target_id: string; kind: string; rebuttal: string; label?: string }> = [],
  followUpsAlreadyClosed = false
): Promise<{ audit: AtsAudit; patchedDraft: ResumeDraft | null }> {
  const followUpsAlreadyDone =
    followUpsAlreadyClosed ||
    priorAtsAnswers.some((a) => a.answer.trim()) ||
    priorRebuttals.length > 0;
  const user = [
    `Job title: ${job.title}`,
    `Company: ${job.company ?? 'Unknown'}`,
    '',
    'Job description:',
    job.description.slice(0, 8000),
    '',
    'Master resume (source of truth — do not invent beyond this + Q&A):',
    resumeText.slice(0, 8000),
    '',
    'Tailored draft under review:',
    JSON.stringify({
      profile: draft.profile,
      experience: draft.experience,
      projects: draft.projects,
      skills: draft.skills,
    }),
    '',
    'Candidate Q&A already collected:',
    JSON.stringify([...answers, ...priorAtsAnswers].slice(0, 40)),
    '',
    'Prior ATS rebuttals (authoritative — already handled; do not re-ask):',
    JSON.stringify(priorRebuttals.slice(0, 20)),
    '',
    followUpsAlreadyDone
      ? 'IMPORTANT: The candidate already answered/rebutted ATS follow-ups. Set questions, findings, and soft_blockers to []. Put residual limits only in ceiling_reasons / path_to_target / evidence_notes. Still patch toward the honest ceiling.'
      : 'Ask short questions only for brand-new missing facts not covered above.',
    '',
    'Known project details (may inform questions, do not contradict):',
    JSON.stringify(CANDIDATE_FACTS.slice(0, 12)),
    '',
    'Return JSON with this shape:',
    JSON.stringify({
      score: 84,
      score_before_patches: 72,
      ceiling: 84,
      ceiling_reasons: ['JD wants 5+ years AWS; you have less — soft cap'],
      path_to_target: 'Only what would break above the ceiling with new real experience.',
      evidence_notes: 'Strong on analytics ownership; thin on cloud evidence.',
      findings: followUpsAlreadyDone
        ? []
        : [
            {
              id: 'f1',
              area: 'evidence',
              severity: 'high',
              issue: 'CI/CD is named in skills but not shown in a bullet',
              fix: 'Add one Channel Rep or project bullet that shows pipeline ownership',
            },
          ],
      soft_blockers: followUpsAlreadyDone
        ? []
        : [
            {
              id: 'b1',
              requirement: '5+ years AWS',
              reason: 'Soft years gate — cannot claim more than you have',
              honest_approach: 'Emphasize depth of cloud-adjacent work without inflating tenure',
            },
          ],
      auto_patch_notes: ['Named Power BI in an existing dashboard bullet'],
      patched_draft: {
        profile: 'updated profile or null sections omitted',
        experience: draft.experience,
        projects: draft.projects,
        skills: draft.skills,
      },
      questions: followUpsAlreadyDone
        ? []
        : [
            {
              id: 'ats_q1',
              question: 'Have you used Terraform or CloudFormation on any project?',
              context: 'JD lists IaC',
              related_requirement: 'Terraform',
              suggested_answers: ['Yes', 'No', 'Adjacent only'],
            },
          ],
    }),
  ].join('\n');

  const raw = await claudeText(
    ATS_AUDIT_SYSTEM,
    `Audit and patch this tailored resume in one response. Push the draft to the honest ceiling — after patches, score must equal ceiling. Return JSON only.\n\n${user}`,
    10000
  );
  if (!raw) throw new Error('Empty ATS audit response');

  const parsed = parseJsonResponse<{
    score?: number;
    score_before_patches?: number;
    ceiling?: number;
    ceiling_reasons?: string[];
    path_to_target?: string;
    evidence_notes?: string;
    findings?: Array<Partial<AtsFinding> & { id?: string }>;
    soft_blockers?: AtsSoftBlocker[];
    auto_patch_notes?: string[];
    questions?: TailorQuestion[];
    patched_draft?: {
      profile?: string;
      experience?: ResumeDraft['experience'];
      projects?: ResumeDraft['projects'];
      skills?: ResumeDraft['skills'];
    } | null;
  }>(raw);

  const patchedDraft = applyPatchedSections(draft, parsed.patched_draft);
  const audit = normalizeAtsAuditFields(parsed, resumeText);

  if (patchedDraft) {
    let fitted = patchedDraft;
    const layout = measureResumeDraft(fitted);
    if (!layout.fits) fitted = fitResumeToPage(fitted).draft;
    return { audit, patchedDraft: fitted };
  }

  return { audit, patchedDraft: null };
}

/** One-shot: apply answers/rebuttals + return patched draft and fresh audit. */
export async function applyAtsFeedbackToResume(
  draft: ResumeDraft,
  resumeText: string,
  job: { title: string; company: string | null; description: string },
  answers: TailorAnswer[],
  rebuttals: Array<{
    target_id: string;
    kind: 'finding' | 'blocker';
    rebuttal: string;
    label?: string;
  }>,
  priorAudit: AtsAudit
): Promise<{ output_text: string; audit: AtsAudit }> {
  const user = [
    `Job title: ${job.title}`,
    `Company: ${job.company ?? 'Unknown'}`,
    '',
    'Job description:',
    job.description.slice(0, 8000),
    '',
    'Master resume (source of truth):',
    resumeText.slice(0, 8000),
    '',
    'Current tailored draft:',
    JSON.stringify({
      profile: draft.profile,
      experience: draft.experience,
      projects: draft.projects,
      skills: draft.skills,
    }),
    '',
    'Prior ATS audit (for context):',
    JSON.stringify({
      score: priorAudit.score,
      ceiling: priorAudit.ceiling,
      findings: priorAudit.findings,
      soft_blockers: priorAudit.soft_blockers,
      path_to_target: priorAudit.path_to_target,
    }),
    '',
    'Candidate answers to ATS questions:',
    JSON.stringify(answers),
    '',
    'Candidate rebuttals (kind=finding or blocker — treat as authoritative clarifications):',
    JSON.stringify(rebuttals),
    '',
    'Return JSON with this shape:',
    JSON.stringify({
      score: 88,
      ceiling: 92,
      ceiling_reasons: ['…'],
      path_to_target: 'Only remaining honest gaps that cannot be patched from known facts…',
      evidence_notes: '…',
      findings: [],
      soft_blockers: [],
      auto_patch_notes: ['Incorporated rebuttal about X into Channel Rep bullet 3'],
      questions: [],
      patched_draft: {
        profile: draft.profile,
        experience: draft.experience,
        projects: draft.projects,
        skills: draft.skills,
      },
    }),
  ].join('\n');

  const raw = await claudeText(
    ATS_APPLY_SYSTEM,
    `Apply ATS feedback, push the draft to the honest ceiling (score must equal ceiling), and re-score. Return JSON only.\n\n${user}`,
    10000
  );
  if (!raw) throw new Error('Empty ATS apply response');

  const parsed = parseJsonResponse<{
    score?: number;
    score_before_patches?: number;
    ceiling?: number;
    ceiling_reasons?: string[];
    path_to_target?: string;
    evidence_notes?: string;
    findings?: Array<Partial<AtsFinding> & { id?: string }>;
    soft_blockers?: AtsSoftBlocker[];
    auto_patch_notes?: string[];
    questions?: TailorQuestion[];
    patched_draft?: {
      profile?: string;
      experience?: ResumeDraft['experience'];
      projects?: ResumeDraft['projects'];
      skills?: ResumeDraft['skills'];
    } | null;
  }>(raw);

  const patched = applyPatchedSections(draft, parsed.patched_draft) ?? draft;
  let fitted = patched;
  const layout = measureResumeDraft(fitted);
  if (!layout.fits) fitted = fitResumeToPage(fitted).draft;

  const audit = normalizeAtsAuditFields(parsed, resumeText, {
    answers,
    rebuttals: rebuttals.map((r) => ({
      target_id: r.target_id,
      kind: r.kind,
      rebuttal: r.rebuttal,
    })),
  });

  return {
    output_text: serializeResumeOutput({
      version: 1,
      draft: fitted,
      keywordAlignment: [],
    }),
    audit,
  };
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

const REVISE_COVER_LETTER_SYSTEM = `You revise an existing cover letter based on the candidate's feedback.

The candidate already has a draft they mostly like. Apply their revision notes while keeping factual accuracy and first-person voice.

Rules:
- Start from current_draft. Apply ONLY the requested tweaks — do not rewrite from scratch unless they asked.
- Same formatting rules as the original cover letter (no letterhead, no date line, salutation + body + Sincerely/Trevor Faust).
- NEVER invent employers, projects, degrees, or skills.
- NEVER use em dashes, en dashes, or " -- " as a dash.
- Output the complete revised letter text only.`;

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
  options: CoverLetterOptions = {}
): Promise<string> {
  const revising = !!(options.revisionNotes?.trim() && options.previousBody?.trim());
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
    ...(revising
      ? [
          'Current cover letter draft:',
          options.previousBody!.trim().slice(0, 6000),
          '',
          'Revision notes from the candidate:',
          options.revisionNotes!.trim().slice(0, 1500),
          '',
        ]
      : []),
    `Today's date is ${coverLetterDate()}. Never write a date line or a different current year.`,
    revising
      ? 'Revise the letter per the notes. Start at the company name or salutation. No letterhead, no date.'
      : 'Write the letter body now. Start at the company name or salutation. No letterhead, no date. Confident tone throughout — no disclaimers about missing skills.',
  ].join('\n');

  const text = await claudeText(
    revising ? REVISE_COVER_LETTER_SYSTEM : COVER_LETTER_SYSTEM,
    user,
    4096
  );
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
