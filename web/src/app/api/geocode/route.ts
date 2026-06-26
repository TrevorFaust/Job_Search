import { suggestUS } from '@/lib/geo';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  if (q.trim().length < 2) {
    return Response.json([]);
  }

  // Nominatim fair-use: one request per user keystroke batch (debounced client-side)
  const results = await suggestUS(q);
  return Response.json(results);
}
