import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { textToDocxBuffer } from '@/lib/resume-docx';
import { textToPdfBuffer } from '@/lib/resume-pdf';
import { getSubscriberByToken } from '@/lib/queries';
import { extractResumeStructure } from '@/lib/resume-structure';
import {
  getActiveResume,
  getTailoringSession,
  resolveJobForSession,
} from '@/lib/resume-queries';

export const runtime = 'nodejs';

type Params = Promise<{ sessionId: string }>;

export async function GET(request: Request, { params }: { params: Params }) {
  const { sessionId } = await params;
  const format = new URL(request.url).searchParams.get('format') === 'pdf' ? 'pdf' : 'docx';
  const docType = new URL(request.url).searchParams.get('doc') === 'cover-letter' ? 'cover-letter' : 'resume';

  const jar = await cookies();
  const token = jar.get('jh_token')?.value;
  if (!token) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const subscriber = await getSubscriberByToken(token);
  if (!subscriber) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const session = await getTailoringSession(sessionId, subscriber.id);
  const draftText =
    docType === 'cover-letter' ? session?.cover_letter_text : session?.output_text;
  if (!draftText) {
    return NextResponse.json(
      { error: docType === 'cover-letter' ? 'No cover letter yet' : 'No tailored resume yet' },
      { status: 404 }
    );
  }

  const resume = await getActiveResume(subscriber.id);
  const formatMeta =
    docType === 'resume' && resume && (resume.format_meta?.sectionOrder?.length ?? 0) > 0
      ? resume.format_meta
      : resume && docType === 'resume'
        ? extractResumeStructure(resume.content_text)
        : undefined;

  const job = await resolveJobForSession(session!, subscriber.id);
  const baseName =
    docType === 'cover-letter'
      ? `Cover Letter - ${job?.title ?? 'Application'} - ${job?.company ?? 'Application'}`
      : job
        ? `Resume - ${job.title} - ${job.company ?? 'Application'}`
        : 'Tailored resume';
  const ext = format === 'pdf' ? 'pdf' : 'docx';
  const safeName = `${baseName}.${ext}`.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '-');

  const buffer =
    format === 'pdf'
      ? await textToPdfBuffer(draftText, formatMeta)
      : await textToDocxBuffer(draftText, formatMeta);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':
        format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${safeName}"`,
    },
  });
}
