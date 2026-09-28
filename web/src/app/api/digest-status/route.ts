import { cookies } from 'next/headers';
import { getLatestDigestNotice } from '@/lib/digest-runs';
import { getSubscriberByToken } from '@/lib/queries';

export async function GET() {
  const jar = await cookies();
  const token = jar.get('jh_token')?.value;
  if (!token) return Response.json({ notice: null });

  const subscriber = await getSubscriberByToken(token);
  if (!subscriber) return Response.json({ notice: null });

  try {
    const notice = await getLatestDigestNotice();
    return Response.json({ notice });
  } catch (error) {
    console.error('[api/digest-status]', error);
    return Response.json({ notice: null });
  }
}
