import { requireTenant } from '@/lib/auth/tenant';
import { instagramRuntime } from '@/lib/channels/instagram/runtime';
import { decryptToken, encryptToken } from '@/lib/channels/instagram/security';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Origem inválida' }, { status: 403 });
  const session = await requireTenant();
  if (!['owner', 'admin'].includes(session.role)) return Response.json({ error: 'Administrador necessário' }, { status: 403 });
  const configured = instagramRuntime();
  if (!configured) return Response.json({ status: 'disconnected' }, { status: 503 });
  const { data, error } = await configured.db.from('instagram_connections').select('id,encrypted_token,expires_at').eq('organization_id', session.organizationId).eq('status', 'connected');
  if (error) return Response.json({ error: 'Conexões indisponíveis' }, { status: 503 });
  let refreshed = 0;
  for (const connection of data ?? []) {
    // Long-lived tokens may be refreshed after 24h and before expiry. Scheduler uses expiry-7d.
    if (Date.parse(connection.expires_at) - Date.now() > 7 * 86_400_000) continue;
    try {
      if (Date.parse(connection.expires_at) <= Date.now()) throw new Error('Expired');
      const token = await configured.client.refresh(decryptToken(connection.encrypted_token, configured.encryptionKey, session.organizationId));
      const { error: saveError } = await configured.db.from('instagram_connections').update({ encrypted_token: encryptToken(token.access_token, configured.encryptionKey, session.organizationId), expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString() }).eq('id', connection.id).eq('organization_id', session.organizationId);
      if (saveError) throw new Error('Persistence failed');
      refreshed++;
    } catch {
      await configured.db.from('instagram_connections').update({ status: 'reconnect_required' }).eq('id', connection.id).eq('organization_id', session.organizationId);
    }
  }
  return Response.json({ refreshed });
}
