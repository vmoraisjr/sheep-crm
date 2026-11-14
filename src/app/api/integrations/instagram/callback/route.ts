import { requireTenant } from '@/lib/auth/tenant';
import { instagramRuntime } from '@/lib/channels/instagram/runtime';
import { encryptToken, readState } from '@/lib/channels/instagram/security';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const session = await requireTenant();
  if (!['owner', 'admin'].includes(session.role)) return Response.json({ error: 'Administrador necessário' }, { status: 403 });
  const configured = instagramRuntime();
  if (!configured) return Response.json({ status: 'disconnected' }, { status: 503 });
  const params = new URL(request.url).searchParams;
  try {
    const state = readState(params.get('state') ?? '', configured.stateSecret, session.user.id);
    if (state.organizationId !== session.organizationId) throw new Error('Tenant mismatch');
    // DELETE ... RETURNING atomically consumes the nonce; a replay cannot exchange a token.
    const { data, error } = await configured.db.from('instagram_oauth_states').delete().eq('nonce', state.nonce).eq('organization_id', session.organizationId).eq('user_id', session.user.id).gt('expires_at', new Date().toISOString()).select('nonce').single();
    if (error || !data) throw new Error('State replay');
    if (params.has('error')) return Response.json({ status: 'pending_permissions', error: 'Autorização recusada. Reconecte quando as permissões estiverem disponíveis.' }, { status: 400 });
    const token = await configured.client.exchange(params.get('code') ?? '');
    const account = await configured.client.account(token.access_token);
    await configured.client.subscribe(account.user_id, token.access_token);
    const { error: saveError } = await configured.db.rpc('connect_instagram', { p_organization_id: session.organizationId, p_account_id: account.user_id, p_username: account.username, p_encrypted_token: encryptToken(token.access_token, configured.encryptionKey, session.organizationId), p_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(), p_user_id: session.user.id });
    if (saveError) throw new Error('Connection persistence failed');
    return Response.json({ status: 'connected', account: account.username, message: 'Inscrição aceita pela API. Confirme o fluxo completo com uma conta tester antes do piloto.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'pending_permissions', error: 'Conexão não concluída. Verifique elegibilidade, permissões, configuração e reconecte.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
}
