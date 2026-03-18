/**
 * Structured logging helpers for signature packet lifecycle events.
 *
 * NEVER logs: access_token, private_key, webhook_secret, raw PII payloads.
 * ALWAYS logs: dealId, packetId, envelopeId (when available), provider, status.
 */

export interface SignatureLogContext {
  dealId?: string | null;
  packetId?: string | null;
  envelopeId?: string | null;
  provider?: string | null;
  status?: string | null;
  threadId?: string | null;
  /** Additional safe key/value pairs — caller is responsible for PII exclusion. */
  meta?: Record<string, string | number | boolean | null | undefined>;
}

function buildPayload(event: string, ctx: SignatureLogContext): Record<string, unknown> {
  const payload: Record<string, unknown> = { event };
  if (ctx.dealId    != null) payload.deal_id    = ctx.dealId;
  if (ctx.packetId  != null) payload.packet_id  = ctx.packetId;
  if (ctx.envelopeId != null) payload.envelope_id = ctx.envelopeId;
  if (ctx.provider  != null) payload.provider   = ctx.provider;
  if (ctx.status    != null) payload.status      = ctx.status;
  if (ctx.threadId  != null) payload.thread_id   = ctx.threadId;
  if (ctx.meta)              Object.assign(payload, ctx.meta);
  return payload;
}

export function logSigInfo(event: string, ctx: SignatureLogContext = {}): void {
  console.log(JSON.stringify(buildPayload(event, ctx)));
}

export function logSigWarn(event: string, ctx: SignatureLogContext = {}): void {
  console.warn(JSON.stringify(buildPayload(event, ctx)));
}

export function logSigError(
  event: string,
  ctx: SignatureLogContext = {},
  err?: unknown,
): void {
  const payload = buildPayload(event, ctx);
  if (err instanceof Error) {
    payload.error_message = err.message;
    // Stack trace is safe (no secrets appear in stack frames)
    payload.error_stack = err.stack;
  }
  console.error(JSON.stringify(payload));
}

// ============================================================
// Convenience wrappers for common lifecycle events
// ============================================================

export function logPacketCreated(ctx: SignatureLogContext): void {
  logSigInfo("sig_packet_created", ctx);
}

export function logPacketSent(ctx: SignatureLogContext): void {
  logSigInfo("sig_packet_sent", ctx);
}

export function logPacketStatusUpdated(ctx: SignatureLogContext): void {
  logSigInfo("sig_packet_status_updated", ctx);
}

export function logPacketCompleted(ctx: SignatureLogContext): void {
  logSigInfo("sig_packet_completed", ctx);
}

export function logPacketError(ctx: SignatureLogContext, err?: unknown): void {
  logSigError("sig_packet_error", ctx, err);
}

export function logWebhookReceived(ctx: SignatureLogContext): void {
  logSigInfo("sig_webhook_received", ctx);
}

export function logWebhookVerifyFailed(ctx: SignatureLogContext): void {
  logSigWarn("sig_webhook_verify_failed", ctx);
}
