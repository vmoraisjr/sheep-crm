import { requireTenant } from '@/lib/auth/tenant';
import { instagramRuntime } from '@/lib/channels/instagram/runtime';
import { createState, readState } from '@/lib/channels/instagram/security';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Origem inválida' }, { status: 403 });
  const session = await requireTenant();
  if (!['owner', 'admin'].includes(session.role)) return Response.json({ error: 'Administrador necessário' }, { status: 403 });
  const configured = instagramRuntime();
  if (!configured) return Response.json({ status: 'disconnected', error: 'Instagram não configurado; demonstração usa adaptador simulado.' }, { status: 503 });
  const state = createState(session.organizationId, session.user.id, configured.stateSecret);
  const parsed = readState(state, configured.stateSecret, session.user.id);
  const { error } = await configured.db.from('instagram_oauth_states').insert({ nonce: parsed.nonce, organization_id: session.organizationId, user_id: session.user.id, expires_at: new Date(parsed.expiresAt).toISOString() });
  if (error) return Response.json({ error: 'Não foi possível iniciar conexão' }, { status: 503 });
  return Response.json({ url: configured.client.authorizationUrl(state), status: 'pending_permissions' }, { headers: { 'Cache-Control': 'no-store' } });
}
