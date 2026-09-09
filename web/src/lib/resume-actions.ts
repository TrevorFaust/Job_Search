'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSubscriberByToken } from './queries';
import { parseResumeFile } from './resume-parse';
import { extractResumeStructure } from './resume-structure';
import {
  createManualJob,
  getActiveResume,
  getJobById,
  getOrCreateManualTailoringSession,
  getOrCreateTailoringSession,
  getTailoringSession,
  resolveJobForSession,
  updateSession,
  upsertResume,
  type TailoringSession,
} from './resume-queries';
import {
  buildFullAnswerSet,
  getAnswerBank,
  mergeQuestionsWithBank,
  upsertAnswerBank,
} from './tailor-answer-bank';
import {
  analyzeResumeForJob,
  applyAtsFeedbackToResume,
  auditTailoredResumeForAts,
  generateCoverLetter,
  generateTailoredResume,
  type GapAnalysis,
  type TailorAnswer,
} from './llm';
import {
  atsFollowUpsAlreadyHandled,
  closeAtsFollowUps,
  isAtsAudit,
  preserveClosedAtsFollowUps,
  pruneAcceptedAtsFollowUps,
  type AtsAudit,
  type AtsRebuttal,
} from './ats-audit';
import { normalizeCoverLetterBody } from './cover-letter';
import { applyLockedStructure, parseResumeOutput, plainTextToResumeDraft, serializeResumeOutput } from './resume-draft';
import { fitResumeToPage } from './resume-fit';
import { capSkillGroupsToLines } from './resume-pdf';
import type { ResumeDraft } from './resume-template';

const COOKIE_NAME = 'jh_token';

async function requireSubscriber(token?: string) {
  const jar = await cookies();
  const editToken = token ?? jar.get(COOKIE_NAME)?.value;
  if (!editToken) throw new Error('Sign in required');
  const sub = await getSubscriberByToken(editToken);
  if (!sub) throw new Error('Invalid session');
  return sub;
}

export async function saveResumeText(token: string, formData: FormData) {
  const sub = await requireSubscriber(token);
  const contentText = String(formData.get('content_text') ?? '').trim();
  if (contentText.length < 100) throw new Error('Paste at least a few lines of resume text');

  await upsertResume(sub.id, contentText, null, 'Master resume', extractResumeStructure(contentText));
  revalidatePath(`/settings/${token}`);
  revalidatePath('/resume');
}

export async function saveResumeFile(token: string, formData: FormData) {
  const sub = await requireSubscriber(token);
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) throw new Error('Choose a file to upload');

  const { text, filename, formatMeta } = await parseResumeFile(file);
  if (text.length < 100) throw new Error('Could not extract enough text from that file');

  await upsertResume(sub.id, text, filename, 'Master resume', formatMeta);
  revalidatePath(`/settings/${token}`);
  revalidatePath('/resume');
}

export async function startTailorSession(jobId: number): Promise<TailoringSession> {
  const sub = await requireSubscriber();
  const resume = await getActiveResume(sub.id);
  if (!resume) throw new Error('Upload your resume in settings first');

  const job = await getJobById(jobId);
  if (!job?.description) throw new Error('Job not found or missing description');

  return getOrCreateTailoringSession(sub.id, jobId, resume, job.description);
}

export async function createManualJobAndTailor(formData: FormData) {
  const sub = await requireSubscriber();
  const resume = await getActiveResume(sub.id);
  if (!resume) throw new Error('Upload your resume in settings first');

  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  if (!title) throw new Error('Job title is required');
  if (description.length < 80) throw new Error('Paste the full job description (at least a few sentences)');

  const job = await createManualJob(sub.id, {
    title,
    company: String(formData.get('company') ?? '').trim(),
    location: String(formData.get('location') ?? '').trim(),
    url: String(formData.get('url') ?? '').trim(),
    salary: String(formData.get('salary') ?? '').trim(),
    description,
  });

  await getOrCreateManualTailoringSession(sub.id, job.id, resume, job.description);
  revalidatePath('/applications');
  redirect(`/tailor/manual/${job.id}`);
}

export async function runGapAnalysis(sessionId: string) {
  const sub = await requireSubscriber();
  const session = await getTailoringSession(sessionId, sub.id);
  if (!session) throw new Error('Session not found');

  const [resume, job] = await Promise.all([
    getActiveResume(sub.id),
    resolveJobForSession(session, sub.id),
  ]);
  if (!resume || resume.id !== session.resume_id) throw new Error('Resume mismatch');
  if (!job?.description) throw new Error('Job not found');

  await updateSession(sessionId, sub.id, { status: 'analyzing', error_message: null });

  try {
    const bank = await getAnswerBank(sub.id);
    const priorAnswers = bank.map((b) => ({
      question_id: b.answer_key,
      answer: b.answer,
      question: b.question,
      related_requirement: b.related_requirement,
    }));

    const { gap_analysis, questions: rawQuestions } = await analyzeResumeForJob(
      resume.content_text,
      {
        title: job.title,
        company: job.company,
        description: job.description,
      },
      priorAnswers
    );

    const merged = mergeQuestionsWithBank(rawQuestions, bank);

    await updateSession(sessionId, sub.id, {
      status: 'questioning',
      gap_analysis,
      questions: merged.questions,
      answers: merged.answers,
    });

    return {
      gap_analysis,
      questions: merged.questions,
      answers: merged.answers,
      reusedCount: merged.reusedCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    await updateSession(sessionId, sub.id, { status: 'failed', error_message: message });
    throw err;
  }
}

export async function saveTailorAnswers(
  sessionId: string,
  answers: TailorAnswer[],
  extraContext = ''
) {
  const sub = await requireSubscriber();
  const session = await getTailoringSession(sessionId, sub.id);
  if (!session) throw new Error('Session not found');

  const visibleAnswers = answers
    .filter((a) => a.answer.trim())
    .map((a) => {
      const q = session.questions.find((item) => item.id === a.question_id);
      return {
        ...a,
        question: q?.question,
        related_requirement: q?.related_requirement,
      };
    });

  const mergedAnswers = [
    ...session.answers.filter(
      (existing) => !visibleAnswers.some((a) => a.question_id === existing.question_id)
    ),
    ...visibleAnswers,
  ];

  await upsertAnswerBank(
    sub.id,
    visibleAnswers.map((a) => ({
      question: a.question ?? a.question_id,
      answer: a.answer,
      related_requirement: a.related_requirement ?? '',
    }))
  );

  await updateSession(sessionId, sub.id, {
    answers: mergedAnswers,
    extra_context: extraContext.trim(),
    status: 'questioning',
  });
}

export async function generateTailoredDraft(
  sessionId: string,
  extraContext = '',
  pagePreference: 'one' | 'two' = 'one'
) {
  const sub = await requireSubscriber();
  const session = await getTailoringSession(sessionId, sub.id);
  if (!session) throw new Error('Session not found');

  const bank = await getAnswerBank(sub.id);
  if (!session.answers.some((a) => a.answer.trim()) && !bank.length) {
    throw new Error('Answer the clarifying questions first');
  }

  const [resume, job] = await Promise.all([
    getActiveResume(sub.id),
    resolveJobForSession(session, sub.id),
  ]);
  if (!resume || !job?.description) throw new Error('Missing resume or job');

  const context = extraContext.trim() || session.extra_context || '';

  await updateSession(sessionId, sub.id, {
    status: 'generating',
    error_message: null,
    extra_context: context,
    page_preference: pagePreference,
  });

  try {
    const gapAnalysis: GapAnalysis =
      session.gap_analysis && 'summary' in session.gap_analysis
        ? (session.gap_analysis as GapAnalysis)
        : { strong_matches: [], partial_matches: [], gaps: [], summary: '' };

    const fullAnswers = buildFullAnswerSet(session.questions, session.answers, bank);
    const formatMeta =
      (resume.format_meta?.sectionOrder?.length ?? 0) > 0
        ? resume.format_meta
        : extractResumeStructure(resume.content_text);

    const [output_text, cover_letter_text] = await Promise.all([
      generateTailoredResume(
        resume.content_text,
        { title: job.title, company: job.company, description: job.description },
        gapAnalysis,
        fullAnswers,
        {
          extraContext: context,
          pageLength: pagePreference,
          formatMeta,
        }
      ),
      generateCoverLetter(
        resume.content_text,
        { title: job.title, company: job.company, description: job.description },
        gapAnalysis,
        fullAnswers,
        { extraContext: context }
      ),
    ]);

    const { output_text: auditedOutput, ats_audit } = await runAtsAuditAndPatch({
      outputText: output_text,
      resumeText: resume.content_text,
      job: { title: job.title, company: job.company, description: job.description },
      fullAnswers,
      subscriberId: sub.id,
      priorAudit: isAtsAudit(session.ats_audit) ? session.ats_audit : null,
    });

    await updateSession(sessionId, sub.id, {
      status: 'done',
      output_text: auditedOutput,
      cover_letter_text,
      ats_audit,
    });
    return { output_text: auditedOutput, cover_letter_text, ats_audit };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed';
    await updateSession(sessionId, sub.id, { status: 'failed', error_message: message });
    throw err;
  }
}

async function runAtsAuditAndPatch(args: {
  outputText: string;
  resumeText: string;
  job: { title: string; company: string | null; description: string };
  fullAnswers: TailorAnswer[];
  priorAtsAnswers?: TailorAnswer[];
  priorAudit?: AtsAudit | null;
  subscriberId?: string;
}): Promise<{ output_text: string; ats_audit: AtsAudit }> {
  const parsed = parseResumeOutput(args.outputText);
  const draft = parsed?.draft ?? plainTextToResumeDraft(args.outputText);
  if (!draft) {
    return {
      output_text: args.outputText,
      ats_audit: {
        score: 0,
        ceiling: 0,
        ceiling_reasons: ['Could not parse draft for ATS audit'],
        path_to_target: 'Regenerate the resume draft, then re-run ATS review.',
        evidence_notes: '',
        findings: [],
        soft_blockers: [],
        auto_patches_applied: [],
        questions: [],
        audited_at: new Date().toISOString(),
      },
    };
  }

  const bank = args.subscriberId ? await getAnswerBank(args.subscriberId) : [];
  const priorAudit = args.priorAudit && isAtsAudit(args.priorAudit) ? args.priorAudit : null;
  const prior = [
    ...(priorAudit?.answers ?? []),
    ...(args.priorAtsAnswers ?? []),
  ];
  const bankHints = bank.slice(0, 30).map((b) => ({
    question_id: b.answer_key,
    answer: b.answer,
    question: b.question,
    related_requirement: b.related_requirement,
  }));
  const priorRebuttals = (priorAudit?.rebuttals ?? []).map((r) => ({
    target_id: r.target_id,
    kind: r.kind,
    rebuttal: r.rebuttal,
  }));

  // Single LLM call: audit + optional in-response patched draft.
  const { audit, patchedDraft } = await auditTailoredResumeForAts(
    draft,
    args.resumeText,
    args.job,
    [...args.fullAnswers, ...bankHints],
    prior,
    priorRebuttals,
    atsFollowUpsAlreadyHandled(priorAudit)
  );

  const merged = mergeQuestionsWithBank(audit.questions, bank);
  const unanswered = merged.questions.filter(
    (q) =>
      !prior.some(
        (a) =>
          (a.question_id === q.id && a.answer.trim()) ||
          (a.question &&
            a.question.toLowerCase().slice(0, 48) === q.question.toLowerCase().slice(0, 48) &&
            a.answer.trim())
      )
  );

  const outputText = patchedDraft
    ? serializeResumeOutput({
        version: 1,
        draft: patchedDraft,
        keywordAlignment: parsed?.keywordAlignment ?? [],
      })
    : args.outputText;

  const nextAudit: AtsAudit = {
    ...audit,
    questions: unanswered,
    answers: [
      ...prior.filter((a) => a.answer.trim()),
      ...merged.answers.filter((a) => !prior.some((p) => p.question_id === a.question_id)),
    ],
    rebuttals: priorAudit?.rebuttals,
  };

  return {
    output_text: outputText,
    ats_audit: preserveClosedAtsFollowUps(priorAudit, nextAudit),
  };
}

/** Apply ATS question answers + finding/blocker rebuttals in one LLM call (patch + rescore). */
export async function applyAtsImprovements(
  sessionId: string,
  answers: TailorAnswer[],
  rebuttals: AtsRebuttal[] = [],
  currentResumeDraft?: ResumeDraft | null
) {
  const sub = await requireSubscriber();
  const session = await getTailoringSession(sessionId, sub.id);
  if (!session) throw new Error('Session not found');
  if (session.status !== 'done' || !session.output_text) {
    throw new Error('Generate a draft first');
  }

  const existingAudit = isAtsAudit(session.ats_audit) ? session.ats_audit : null;
  if (!existingAudit) throw new Error('Run a draft generation with ATS audit first');

  const visibleAnswers = answers
    .filter((a) => a.answer.trim())
    .map((a) => {
      const q = existingAudit.questions.find((item) => item.id === a.question_id);
      return {
        ...a,
        question: q?.question ?? a.question,
        related_requirement: q?.related_requirement ?? a.related_requirement,
      };
    });

  const visibleRebuttals = rebuttals
    .map((r) => {
      const kind = r.kind === 'blocker' ? 'blocker' : 'finding';
      const label =
        kind === 'blocker'
          ? existingAudit.soft_blockers.find((b) => (b.id || b.requirement) === r.target_id)
              ?.requirement
          : existingAudit.findings.find((f) => (f.id || f.issue) === r.target_id)?.issue;
      return {
        target_id: r.target_id,
        kind: kind as 'finding' | 'blocker',
        rebuttal: r.rebuttal.trim(),
        label,
      };
    })
    .filter((r) => r.rebuttal.length > 0);

  if (!visibleAnswers.length && !visibleRebuttals.length) {
    throw new Error('Answer a question or rebut a finding/blocker before applying');
  }

  if (visibleAnswers.length) {
    await upsertAnswerBank(
      sub.id,
      visibleAnswers.map((a) => ({
        question: a.question ?? a.question_id,
        answer: a.answer,
        related_requirement: a.related_requirement ?? '',
      }))
    );
  }

  const [resume, job] = await Promise.all([
    getActiveResume(sub.id),
    resolveJobForSession(session, sub.id),
  ]);
  if (!resume || !job?.description) throw new Error('Missing resume or job');

  const previousDraft =
    currentResumeDraft ??
    parseResumeOutput(session.output_text)?.draft ??
    plainTextToResumeDraft(session.output_text);
  if (!previousDraft) throw new Error('No resume draft to patch');

  const keywordAlignment = parseResumeOutput(session.output_text)?.keywordAlignment ?? [];

  await updateSession(sessionId, sub.id, { status: 'generating', error_message: null });

  try {
    const { output_text: patchedRaw, audit } = await applyAtsFeedbackToResume(
      previousDraft,
      resume.content_text,
      { title: job.title, company: job.company, description: job.description },
      visibleAnswers,
      visibleRebuttals,
      existingAudit
    );

    const patchedDraft = parseResumeOutput(patchedRaw)?.draft ?? previousDraft;
    const output_text = serializeResumeOutput({
      version: 1,
      draft: patchedDraft,
      keywordAlignment,
    });

    const mergedAtsAnswers = [
      ...(existingAudit.answers ?? []).filter(
        (a) => !visibleAnswers.some((v) => v.question_id === a.question_id)
      ),
      ...visibleAnswers,
    ];

    const bank = await getAnswerBank(sub.id);
    const mergedQs = mergeQuestionsWithBank(audit.questions, bank);
    const pruned = pruneAcceptedAtsFollowUps(existingAudit, {
      ...audit,
      questions: mergedQs.questions,
      answers: mergedAtsAnswers,
      rebuttals: [
        ...(existingAudit.rebuttals ?? []).filter(
          (r) =>
            !visibleRebuttals.some(
              (v) => v.target_id === r.target_id && v.kind === (r.kind ?? 'finding')
            )
        ),
        ...visibleRebuttals.map((r) => ({
          target_id: r.target_id,
          kind: r.kind,
          rebuttal: r.rebuttal,
        })),
      ],
    });

    const finalAudit: AtsAudit = pruned;

    await updateSession(sessionId, sub.id, {
      status: 'done',
      output_text,
      ats_audit: finalAudit,
    });

    return { output_text, ats_audit: finalAudit };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ATS improvement failed';
    await updateSession(sessionId, sub.id, { status: 'failed', error_message: message });
    throw err;
  }
}

/** Close leftover ATS rebuttal/question UI without regenerating (after apply or when skipping). */
export async function dismissAtsFollowUps(sessionId: string) {
  const sub = await requireSubscriber();
  const session = await getTailoringSession(sessionId, sub.id);
  if (!session) throw new Error('Session not found');
  if (!isAtsAudit(session.ats_audit)) throw new Error('No ATS audit on this session');

  const ats_audit = closeAtsFollowUps(session.ats_audit);
  await updateSession(sessionId, sub.id, { ats_audit, status: 'done' });
  return { ats_audit };
}

/** Re-score the current resume draft (fresh ATS pass — use after regenerate or edits). */
export async function refreshAtsAudit(sessionId: string, currentResumeDraft?: ResumeDraft | null) {
  const sub = await requireSubscriber();
  const session = await getTailoringSession(sessionId, sub.id);
  if (!session) throw new Error('Session not found');
  if (!session.output_text) throw new Error('Generate a draft first');

  const [resume, job] = await Promise.all([
    getActiveResume(sub.id),
    resolveJobForSession(session, sub.id),
  ]);
  if (!resume || !job?.description) throw new Error('Missing resume or job');

  const bank = await getAnswerBank(sub.id);
  const fullAnswers = buildFullAnswerSet(session.questions, session.answers, bank);
  const baseOutput =
    currentResumeDraft != null
      ? serializeResumeOutput({
          version: 1,
          draft: applyLockedStructure(currentResumeDraft),
          keywordAlignment: parseResumeOutput(session.output_text)?.keywordAlignment ?? [],
        })
      : session.output_text;

  const { output_text, ats_audit } = await runAtsAuditAndPatch({
    outputText: baseOutput,
    resumeText: resume.content_text,
    job: { title: job.title, company: job.company, description: job.description },
    fullAnswers,
    subscriberId: sub.id,
    priorAudit: isAtsAudit(session.ats_audit) ? session.ats_audit : null,
  });

  await updateSession(sessionId, sub.id, { status: 'done', output_text, ats_audit });
  return { output_text, ats_audit };
}

export async function generateCoverLetterDraft(sessionId: string, extraContext = '') {
  const sub = await requireSubscriber();
  const session = await getTailoringSession(sessionId, sub.id);
  if (!session) throw new Error('Session not found');
  if (session.status !== 'done' || !session.output_text) {
    throw new Error('Generate the resume draft first');
  }

  const bank = await getAnswerBank(sub.id);
  const [resume, job] = await Promise.all([
    getActiveResume(sub.id),
    resolveJobForSession(session, sub.id),
  ]);
  if (!resume || !job?.description) throw new Error('Missing resume or job');

  const context = extraContext.trim() || session.extra_context || '';
  const gapAnalysis: GapAnalysis =
    session.gap_analysis && 'summary' in session.gap_analysis
      ? (session.gap_analysis as GapAnalysis)
      : { strong_matches: [], partial_matches: [], gaps: [], summary: '' };
  const fullAnswers = buildFullAnswerSet(session.questions, session.answers, bank);

  const cover_letter_text = await generateCoverLetter(
    resume.content_text,
    { title: job.title, company: job.company, description: job.description },
    gapAnalysis,
    fullAnswers,
    { extraContext: context }
  );

  await updateSession(sessionId, sub.id, { cover_letter_text });
  return { cover_letter_text };
}

export async function saveCoverLetter(sessionId: string, coverLetterText: string) {
  const sub = await requireSubscriber();
  const session = await getTailoringSession(sessionId, sub.id);
  if (!session) throw new Error('Session not found');
  const cover_letter_text = normalizeCoverLetterBody(coverLetterText);
  if (!cover_letter_text.trim()) throw new Error('Cover letter is empty');
  await updateSession(sessionId, sub.id, { cover_letter_text });
  return { cover_letter_text };
}

export async function saveResumeDraftOutput(sessionId: string, outputText: string) {
  const sub = await requireSubscriber();
  const session = await getTailoringSession(sessionId, sub.id);
  if (!session) throw new Error('Session not found');
  const trimmed = outputText.trim();
  if (!trimmed) throw new Error('Resume draft is empty');
  await updateSession(sessionId, sub.id, { output_text: trimmed, status: 'done' });
  return { output_text: trimmed };
}

export async function saveResumeDraft(sessionId: string, draft: ResumeDraft) {
  const sub = await requireSubscriber();
  const session = await getTailoringSession(sessionId, sub.id);
  if (!session) throw new Error('Session not found');

  const existing = parseResumeOutput(session.output_text);
  const locked = capSkillGroupsToLines(applyLockedStructure(draft));
  await updateSession(sessionId, sub.id, {
    output_text: serializeResumeOutput({
      version: 1,
      draft: locked,
      keywordAlignment: existing?.keywordAlignment ?? [],
    }),
    status: 'done',
  });
  return { draft: locked };
}

export async function fitResumeDraft(sessionId: string, draft: ResumeDraft) {
  const sub = await requireSubscriber();
  const session = await getTailoringSession(sessionId, sub.id);
  if (!session) throw new Error('Session not found');

  const existing = parseResumeOutput(session.output_text);
  const fitted = fitResumeToPage(applyLockedStructure(draft));
  await updateSession(sessionId, sub.id, {
    output_text: serializeResumeOutput({
      version: 1,
      draft: fitted.draft,
      keywordAlignment: existing?.keywordAlignment ?? [],
    }),
    status: 'done',
  });
  return fitted;
}

const MAX_REVISION_LENGTH = 1500;

export async function reviseTailoredDraft(
  sessionId: string,
  revisionNotes: string,
  target: 'resume' | 'cover-letter',
  currentResumeDraft?: ResumeDraft | string | null,
  currentCoverLetter?: string | null
) {
  const sub = await requireSubscriber();
  const session = await getTailoringSession(sessionId, sub.id);
  if (!session) throw new Error('Session not found');
  if (session.status !== 'done' || !session.output_text) {
    throw new Error('Generate a draft first');
  }

  const notes = revisionNotes.trim();
  if (!notes) throw new Error('Describe what you want changed before regenerating');
  if (notes.length > MAX_REVISION_LENGTH) {
    throw new Error(`Keep revision notes under ${MAX_REVISION_LENGTH} characters`);
  }

  const bank = await getAnswerBank(sub.id);
  const [resume, job] = await Promise.all([
    getActiveResume(sub.id),
    resolveJobForSession(session, sub.id),
  ]);
  if (!resume || !job?.description) throw new Error('Missing resume or job');

  const context = session.extra_context?.trim() || '';
  const gapAnalysis: GapAnalysis =
    session.gap_analysis && 'summary' in session.gap_analysis
      ? (session.gap_analysis as GapAnalysis)
      : { strong_matches: [], partial_matches: [], gaps: [], summary: '' };
  const fullAnswers = buildFullAnswerSet(session.questions, session.answers, bank);
  const pagePreference = session.page_preference ?? 'one';

  await updateSession(sessionId, sub.id, { status: 'generating', error_message: null });

  try {
    if (target === 'resume') {
      const previousDraft =
        (typeof currentResumeDraft === 'object' && currentResumeDraft
          ? currentResumeDraft
          : null) ??
        parseResumeOutput(
          typeof currentResumeDraft === 'string' ? currentResumeDraft : session.output_text
        )?.draft ??
        plainTextToResumeDraft(
          typeof currentResumeDraft === 'string' ? currentResumeDraft : session.output_text
        ) ??
        null;
      if (!previousDraft) throw new Error('No resume draft to revise');

      const formatMeta =
        (resume.format_meta?.sectionOrder?.length ?? 0) > 0
          ? resume.format_meta
          : extractResumeStructure(resume.content_text);

      const output_text = await generateTailoredResume(
        resume.content_text,
        { title: job.title, company: job.company, description: job.description },
        gapAnalysis,
        fullAnswers,
        {
          extraContext: context,
          pageLength: pagePreference,
          formatMeta,
          previousDraft,
          revisionNotes: notes,
        }
      );

      const { output_text: auditedOutput, ats_audit } = await runAtsAuditAndPatch({
        outputText: output_text,
        resumeText: resume.content_text,
        job: { title: job.title, company: job.company, description: job.description },
        fullAnswers,
        subscriberId: sub.id,
        priorAudit: isAtsAudit(session.ats_audit) ? session.ats_audit : null,
      });

      await updateSession(sessionId, sub.id, {
        status: 'done',
        output_text: auditedOutput,
        ats_audit,
      });
      return {
        output_text: auditedOutput,
        cover_letter_text: session.cover_letter_text,
        ats_audit,
      };
    }

    const previousBody = normalizeCoverLetterBody(
      currentCoverLetter ?? session.cover_letter_text ?? ''
    );
    if (!previousBody.trim()) throw new Error('No cover letter draft to revise');

    const cover_letter_text = await generateCoverLetter(
      resume.content_text,
      { title: job.title, company: job.company, description: job.description },
      gapAnalysis,
      fullAnswers,
      {
        extraContext: context,
        previousBody,
        revisionNotes: notes,
      }
    );

    await updateSession(sessionId, sub.id, { status: 'done', cover_letter_text });
    return { output_text: session.output_text, cover_letter_text };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Revision failed';
    await updateSession(sessionId, sub.id, { status: 'failed', error_message: message });
    throw err;
  }
}

export async function resetTailorSession(sessionId: string) {
  const sub = await requireSubscriber();
  const session = await getTailoringSession(sessionId, sub.id);
  if (!session) throw new Error('Session not found');

  const job = await resolveJobForSession(session, sub.id);
  const resume = await getActiveResume(sub.id);
  if (!job?.description || !resume) throw new Error('Missing job or resume');

  if (session.manual_job_id) {
    const fresh = await getOrCreateManualTailoringSession(
      sub.id,
      session.manual_job_id,
      resume,
      job.description
    );
    return fresh;
  }

  if (!session.job_id) throw new Error('Missing job reference');

  const fresh = await getOrCreateTailoringSession(sub.id, session.job_id, resume, job.description);
  return fresh;
}
