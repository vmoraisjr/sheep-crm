import { assertSendAllowed, type SendPolicy, type WhatsAppContent } from './policy';

export class MetaApiError extends Error {
  constructor(public readonly status: number, public readonly code: number | undefined, public readonly retryable: boolean) {
    super(`WhatsApp API request failed (${status}, code ${code ?? 'unknown'})`);
  }
}
export type WhatsAppCredentials = { phoneNumberId: string; accessToken: string; graphVersion: string };
export class WhatsAppCloudAdapter {
  readonly mode = 'official' as const;
  constructor(private readonly credentials: WhatsAppCredentials, private readonly request: typeof fetch = fetch) {
    if (!/^[0-9]+$/.test(credentials.phoneNumberId) || !/^v[0-9]+\.0$/.test(credentials.graphVersion) || !credentials.accessToken) throw new Error('Invalid WhatsApp configuration');
  }
  async send(to: string, content: WhatsAppContent, policy: SendPolicy, now?: Date): Promise<{ providerMessageId: string; mode: 'official' }> {
    assertSendAllowed(policy, content, now);
    if (!/^[0-9]{7,15}$/.test(to)) throw new Error('invalid_recipient');
    const payload: Record<string, unknown> = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: content.type };
    if (content.type === 'text') payload.text = { body: content.text };
    else if (content.type === 'template') payload.template = { name: content.name, language: { code: content.language } };
    else payload[content.type] = { id: content.mediaId, ...('caption' in content && content.caption && content.type !== 'audio' ? { caption: content.caption } : {}) };
    const response = await this.request(`https://graph.facebook.com/${this.credentials.graphVersion}/${this.credentials.phoneNumberId}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.credentials.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok) throw new MetaApiError(response.status, result.error?.code, response.status === 429 || response.status >= 500);
    const id = result.messages?.[0]?.id;
    if (typeof id !== 'string') throw new Error('Invalid WhatsApp API response');
    return { providerMessageId: id, mode: this.mode };
  }
  async getMedia(mediaId: string): Promise<{ url: string; mimeType: string }> {
    if (!/^[0-9]+$/.test(mediaId)) throw new Error('invalid_media_id');
    const response = await this.request(`https://graph.facebook.com/${this.credentials.graphVersion}/${mediaId}`, { headers: { Authorization: `Bearer ${this.credentials.accessToken}` }, signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok) throw new MetaApiError(response.status, data.error?.code, response.status === 429 || response.status >= 500);
    if (typeof data.url !== 'string' || !data.url.startsWith('https://') || typeof data.mime_type !== 'string') throw new Error('Invalid media response');
    return { url: data.url, mimeType: data.mime_type };
  }
}
/** Local development only. Does not contact Meta and cannot prove sandbox connectivity. */
export class SimulatedWhatsAppAdapter {
  readonly mode = 'simulated' as const;
  async send(to: string, content: WhatsAppContent, policy: SendPolicy, now?: Date) {
    assertSendAllowed(policy, content, now);
    return { providerMessageId: `simulated:${to}:${crypto.randomUUID()}`, mode: this.mode };
  }
}
