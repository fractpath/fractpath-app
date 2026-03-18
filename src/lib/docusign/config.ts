import type { DocuSignEnvConfig } from "./types";

// server-only guard
if (typeof window !== "undefined") {
  throw new Error("src/lib/docusign/config.ts must only be imported on the server.");
}

const REQUIRED_VARS = [
  "DOCUSIGN_ACCOUNT_ID",
  "DOCUSIGN_BASE_PATH",
  "DOCUSIGN_AUTH_SERVER",
  "DOCUSIGN_INTEGRATION_KEY",
  "DOCUSIGN_USER_ID",
  "DOCUSIGN_PRIVATE_KEY",
  "DOCUSIGN_WEBHOOK_HMAC_KEY",
  "DOCUSIGN_TEMPLATE_ID_ACTIVE_DEAL",
] as const;

const OPTIONAL_VARS = [
  "DOCUSIGN_ENV",
  "DOCUSIGN_BRAND_ID",
] as const;

/**
 * Returns a presence map for all DocuSign env vars.
 * Safe to expose in the health route — values are never included.
 */
export function checkEnvPresence(): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const v of REQUIRED_VARS) {
    result[v] = !!process.env[v];
  }
  for (const v of OPTIONAL_VARS) {
    result[v] = !!process.env[v];
  }
  return result;
}

/**
 * Loads and validates the DocuSign server config.
 * Throws with an actionable message if any required var is absent.
 * Secret values are NEVER included in thrown errors or logs.
 */
export function loadConfig(): DocuSignEnvConfig {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `DocuSign config error: missing required env vars: ${missing.join(", ")}. ` +
      `Set them in your environment and restart the server.`
    );
  }

  const rawKey = process.env.DOCUSIGN_PRIVATE_KEY!;
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const rawBasePath = process.env.DOCUSIGN_BASE_PATH!.replace(/\/+$/, "");
  const rawAuthServer = process.env.DOCUSIGN_AUTH_SERVER!.replace(/\/+$/, "");

  const env = process.env.DOCUSIGN_ENV === "production" ? "production" : "demo";

  const brandId = process.env.DOCUSIGN_BRAND_ID?.trim() || undefined;

  return {
    accountId: process.env.DOCUSIGN_ACCOUNT_ID!,
    basePath: rawBasePath,
    authServer: rawAuthServer,
    integrationKey: process.env.DOCUSIGN_INTEGRATION_KEY!,
    userId: process.env.DOCUSIGN_USER_ID!,
    privateKey,
    env,
    templateIdActiveDeal: process.env.DOCUSIGN_TEMPLATE_ID_ACTIVE_DEAL!,
    brandId,
  };
}

/**
 * Returns the HMAC key used to verify incoming DocuSign Connect webhook
 * payloads. Throws if the env var is absent (fail-closed).
 * The raw value is NEVER logged.
 */
export function loadWebhookHmacKey(): string {
  const key = process.env.DOCUSIGN_WEBHOOK_HMAC_KEY;
  if (!key) {
    throw new Error(
      "DocuSign config error: DOCUSIGN_WEBHOOK_HMAC_KEY is required for webhook verification."
    );
  }
  return key;
}
