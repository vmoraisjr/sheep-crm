import { timingSafeEqual } from 'node:crypto';
import { instagramRuntime } from '@/lib/channels/instagram/runtime';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const secret = process.env.INSTAGRAM_WORKER_SECRET;
  if (!secret || secret.length < 32) return Response.json({ error: 'Worker não configurado' }, { status: 503 });
  const expected = Buffer.from(`Bearer ${secret}`), supplied = Buffer.from(request.headers.get('authorization') ?? '');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const configured = instagramRuntime();
  if (!configured) return Response.json({ error: 'Instagram desconectado' }, { status: 503 });
  const { data, error } = await configured.db.rpc('process_instagram_jobs', { p_limit: 50 });
  if (error) return Response.json({ error: 'Fila indisponível' }, { status: 503 });
  return Response.json({ processed: data });
}
