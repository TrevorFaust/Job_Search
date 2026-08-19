import { cookies } from 'next/headers';
import { fetchBoardPayloadFromToken, searchParamsToRecord } from '@/lib/board-data';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = searchParamsToRecord(url.searchParams);
  const jar = await cookies();
  const token = jar.get('jh_token')?.value;

  try {
    const payload = await fetchBoardPayloadFromToken(params, token);
    return Response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load board';
    const status = message.includes('Sign in') ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
