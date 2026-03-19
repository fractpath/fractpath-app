import type {
  DocuSignEnvConfig,
  DocuSignTokenResult,
  DocuSignEnvelopeSummary,
  DocuSignEnvelopeDetail,
  DocuSignRecipientsResponse,
  DocuSignEnvelopeDocumentsResponse,
  CreateEnvelopeFromTemplateInput,
} from "./types";
import { loadConfig } from "./config";
import { getDocusignAccessToken } from "./auth";

// ============================================================
// Public access token helper (convenience wrapper)
// ============================================================

/**
 * Returns a valid access token using the server config.
 * Callers should prefer this over calling getDocusignAccessToken directly.
 */
export async function getDocusignToken(): Promise<DocuSignTokenResult> {
  const config = loadConfig();
  return getDocusignAccessToken(config);
}

// ============================================================
// Narrow DocuSign API client
// All raw API calls are centralised here.
// ============================================================

export interface DocuSignClient {
  config: DocuSignEnvConfig;
  accessToken: string;
}

/**
 * Creates a short-lived client handle with a valid access token.
 * Obtain this at the top of any privileged route handler that needs DocuSign.
 */
export async function createDocusignClient(): Promise<DocuSignClient> {
  const config = loadConfig();
  const tokenResult = await getDocusignAccessToken(config);
  return { config, accessToken: tokenResult.access_token };
}

// ============================================================
// Internal helpers
// ============================================================

function accountBase(client: DocuSignClient): string {
  return `${client.config.basePath}/v2.1/accounts/${client.config.accountId}`;
}

async function dsGet<T>(client: DocuSignClient, path: string): Promise<T> {
  const url = `${accountBase(client)}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${client.accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(`DocuSign GET ${path} failed (${res.status}): ${body.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

async function dsPost<T>(client: DocuSignClient, path: string, body: unknown): Promise<T> {
  const url = `${accountBase(client)}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${client.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const rawBody = await res.text().catch(() => "(no body)");
    throw new Error(`DocuSign POST ${path} failed (${res.status}): ${rawBody.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

// ============================================================
// Envelope operations (MVP set)
// ============================================================

/**
 * Creates a DocuSign envelope from the configured MVP template.
 * Prompt 1: scaffolded — caller validation and field mapping done in Prompt 2.
 */
export async function createEnvelopeFromTemplate(
  client: DocuSignClient,
  input: CreateEnvelopeFromTemplateInput,
): Promise<DocuSignEnvelopeSummary> {
  const sendMode = input.sendMode ?? "sent";

  const envelopeDefinition = {
    templateId: input.templateId,
    status: sendMode,
    emailSubject: input.emailSubject,
    ...(input.brandId ? { brandId: input.brandId } : {}),
    templateRoles: [
      {
        roleName: "Buyer",
        name: input.buyer.name,
        email: input.buyer.email,
        recipientId: "1",
        routingOrder: "1",
      },
      {
        roleName: "Owner",
        name: input.owner.name,
        email: input.owner.email,
        recipientId: "2",
        routingOrder: "2",
      },
    ],
  };

  return dsPost<DocuSignEnvelopeSummary>(client, "/envelopes", envelopeDefinition);
}

/**
 * Retrieves envelope details by envelope ID.
 */
export async function getEnvelope(
  client: DocuSignClient,
  envelopeId: string,
): Promise<DocuSignEnvelopeDetail> {
  return dsGet<DocuSignEnvelopeDetail>(client, `/envelopes/${envelopeId}`);
}

/**
 * Lists recipient details for an envelope.
 */
export async function listEnvelopeRecipients(
  client: DocuSignClient,
  envelopeId: string,
): Promise<DocuSignRecipientsResponse> {
  return dsGet<DocuSignRecipientsResponse>(
    client,
    `/envelopes/${envelopeId}/recipients`
  );
}

/**
 * Lists documents attached to a completed envelope.
 */
export async function getEnvelopeDocuments(
  client: DocuSignClient,
  envelopeId: string,
): Promise<DocuSignEnvelopeDocumentsResponse> {
  return dsGet<DocuSignEnvelopeDocumentsResponse>(
    client,
    `/envelopes/${envelopeId}/documents`
  );
}

export interface DocuSignDocumentDownload {
  bytes: Buffer;
  contentType: string;
  filename?: string;
}

/**
 * Downloads raw document bytes for a specific document in an envelope.
 * documentId: "combined" = merged completed agreement, "certificate" = completion certificate,
 * or a numeric string for an individual uploaded document.
 * Returns raw bytes — never logs them.
 */
export async function downloadEnvelopeDocument(
  client: DocuSignClient,
  envelopeId: string,
  documentId: string,
): Promise<DocuSignDocumentDownload> {
  const url = `${accountBase(client)}/envelopes/${envelopeId}/documents/${documentId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${client.accessToken}`,
      Accept: "application/pdf, application/octet-stream, */*",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(
      `DocuSign document download failed [envelopeId=${envelopeId}, documentId=${documentId}] ` +
      `(${res.status}): ${body.slice(0, 400)}`
    );
  }
  const arrayBuffer = await res.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  const contentType = res.headers.get("Content-Type") ?? "application/pdf";
  const cd = res.headers.get("Content-Disposition") ?? "";
  const filenameMatch = cd.match(/filename[^;=\n]*=["']?([^"'\n]*)["']?/i);
  const filename = filenameMatch?.[1]?.trim() || undefined;
  return { bytes, contentType, filename };
}

// ============================================================
// getUserInfo — kept for health route compatibility
// ============================================================
export async function getUserInfo(
  config: DocuSignEnvConfig,
  accessToken: string,
): Promise<{ name?: string; email?: string }> {
  const url = `${config.authServer}/oauth/userinfo`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(`DocuSign userinfo failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  return {
    name: data.name ?? undefined,
    email: data.email ?? undefined,
  };
}

// ============================================================
// Webhook signature verification
// Uses HMAC-SHA256 with DOCUSIGN_WEBHOOK_HMAC_KEY.
// TODO (Prompt 2): wire into the webhook route handler.
// ============================================================

/**
 * Verifies a DocuSign Connect HMAC-SHA256 webhook signature.
 * Returns true if the payload is authentic, false otherwise.
 * Never throws on verification failure — callers must check the return value.
 */
export async function verifyDocusignWebhookSignature(
  rawBody: string,
  hmacSignatureHeader: string,
  hmacKey: string,
): Promise<boolean> {
  try {
    const crypto = await import("crypto");
    const hmac = crypto.createHmac("sha256", hmacKey);
    hmac.update(rawBody, "utf8");
    const expected = hmac.digest("base64");
    // Constant-time comparison
    const a = Buffer.from(expected, "base64");
    const b = Buffer.from(hmacSignatureHeader, "base64");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ============================================================
// Raw pass-through helpers (kept for health route and future use)
// ============================================================

export async function apiGet(
  config: DocuSignEnvConfig,
  accessToken: string,
  path: string,
): Promise<unknown> {
  const url = `${config.basePath}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(`DocuSign API GET ${path} failed (${res.status}): ${body}`);
  }
  return res.json();
}

export async function apiPost(
  config: DocuSignEnvConfig,
  accessToken: string,
  path: string,
  body: unknown,
): Promise<unknown> {
  const url = `${config.basePath}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const rawBody = await res.text().catch(() => "(no body)");
    throw new Error(`DocuSign API POST ${path} failed (${res.status}): ${rawBody}`);
  }
  return res.json();
}
