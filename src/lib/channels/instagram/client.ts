export const INSTAGRAM_SCOPES = ['instagram_business_basic', 'instagram_business_manage_messages'] as const;
export interface InstagramConfig { appId: string; appSecret: string; redirectUri: string; graphVersion: string }
export interface InstagramToken { access_token: string; expires_in: number }
export interface InstagramAccount { user_id: string; username: string; account_type: 'BUSINESS' | 'MEDIA_CREATOR' | string }
export class InstagramApiError extends Error {
  constructor(public readonly code: 'unauthorized' | 'rate_limited' | 'provider_error' | 'invalid_response', public readonly retryable = false) { super(`Instagram API: ${code}`); }
}
export class InstagramClient {
  constructor(private config: InstagramConfig, private request: typeof fetch = fetch) {
    if (!/^v\d+\.\d+$/.test(config.graphVersion)) throw new Error('Explicit valid Meta Graph version required');
    if (!config.appId || !config.appSecret || !config.redirectUri.startsWith('https://')) throw new Error('Instagram configuration incomplete');
  }
  authorizationUrl(state: string) {
    const url = new URL('https://www.instagram.com/oauth/authorize');
    url.search = new URLSearchParams({ client_id: this.config.appId, redirect_uri: this.config.redirectUri, response_type: 'code', scope: INSTAGRAM_SCOPES.join(','), state, enable_fb_login: '0', force_authentication: '1' }).toString();
    return url.toString();
  }
  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.request(url, { ...init, signal: AbortSignal.timeout(15_000), redirect: 'error' });
    if (!response.ok) {
      // Never expose a provider body: it can contain tokens or user data.
      throw new InstagramApiError(response.status === 429 ? 'rate_limited' : response.status === 401 || response.status === 403 ? 'unauthorized' : 'provider_error', response.status === 429 || response.status >= 500);
    }
    return response.json() as Promise<T>;
  }
  async exchange(code: string): Promise<InstagramToken> {
    if (!code || code.length > 4096) throw new Error('Invalid authorization code');
    const short = await this.json<{ access_token: string }>('https://api.instagram.com/oauth/access_token', { method: 'POST', body: new URLSearchParams({ client_id: this.config.appId, client_secret: this.config.appSecret, grant_type: 'authorization_code', redirect_uri: this.config.redirectUri, code }) });
    if (!short.access_token) throw new InstagramApiError('invalid_response');
    const url = new URL('https://graph.instagram.com/access_token');
    url.search = new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: this.config.appSecret, access_token: short.access_token }).toString();
    const token = await this.json<InstagramToken>(url.toString());
    if (!token.access_token || !(token.expires_in > 0)) throw new InstagramApiError('invalid_response');
    return token;
  }
  async refresh(token: string): Promise<InstagramToken> {
    const url = new URL('https://graph.instagram.com/refresh_access_token');
    url.search = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token }).toString();
    const result = await this.json<InstagramToken>(url.toString());
    if (!result.access_token || !(result.expires_in > 0)) throw new InstagramApiError('invalid_response');
    return result;
  }
  async account(token: string): Promise<InstagramAccount> {
    const account = await this.json<InstagramAccount>(`https://graph.instagram.com/${this.config.graphVersion}/me?fields=user_id,username,account_type`, { headers: { Authorization: `Bearer ${token}` } });
    if (!account.user_id || !account.username || !['BUSINESS', 'MEDIA_CREATOR'].includes(account.account_type)) throw new Error('Instagram professional account eligibility not verified');
    return account;
  }
  async subscribe(accountId: string, token: string) {
    const result = await this.json<{ success: boolean }>(`https://graph.instagram.com/${this.config.graphVersion}/${encodeURIComponent(accountId)}/subscribed_apps`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ subscribed_fields: 'messages,messaging_seen' }) });
    if (result.success !== true) throw new InstagramApiError('invalid_response');
  }
  async send(input: { accountId: string; recipientId: string; text: string; token: string; lastInboundAt: string; optedOut: boolean; now?: number }) {
    const now = input.now ?? Date.now();
    const elapsed = now - Date.parse(input.lastInboundAt);
    if (input.optedOut || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 86_400_000) throw new Error('Instagram reply blocked by consent or 24h window');
    if (!input.text.trim() || input.text.length > 1000) throw new Error('Instagram text must contain 1–1000 characters');
    const result = await this.json<{ message_id: string; recipient_id: string }>(`https://graph.instagram.com/${this.config.graphVersion}/${encodeURIComponent(input.accountId)}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${input.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient: { id: input.recipientId }, message: { text: input.text } }) });
    if (!result.message_id) throw new InstagramApiError('invalid_response');
    return { providerMessageId: result.message_id, origin: 'meta' as const };
  }
}
