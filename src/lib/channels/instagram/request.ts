/** Read raw bytes without buffering an unbounded/chunked unauthenticated payload. */
export async function boundedBody(request: Request, limit = 1_048_576): Promise<string> {
  if (Number(request.headers.get('content-length') || 0) > limit) throw new Error('BODY_TOO_LARGE');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error('BODY_TOO_LARGE');
      }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
