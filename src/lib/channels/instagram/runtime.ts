import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { InstagramClient } from './client';
export function instagramRuntime() {
  const { INSTAGRAM_APP_ID: appId, INSTAGRAM_APP_SECRET: appSecret, INSTAGRAM_REDIRECT_URI: redirectUri, META_GRAPH_VERSION: graphVersion, INSTAGRAM_STATE_SECRET: stateSecret, INSTAGRAM_ENCRYPTION_KEY: encryptionKey, INSTAGRAM_VERIFY_TOKEN: verifyToken, NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey } = process.env;
  if (![appId, appSecret, redirectUri, graphVersion, stateSecret, encryptionKey, verifyToken, url, serviceKey].every(Boolean)) return null;
  return { client: new InstagramClient({ appId: appId!, appSecret: appSecret!, redirectUri: redirectUri!, graphVersion: graphVersion! }), appSecret: appSecret!, stateSecret: stateSecret!, encryptionKey: encryptionKey!, verifyToken: verifyToken!, db: createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } }) };
}
