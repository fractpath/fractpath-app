import type { DocuSignEnvConfig } from "./types";

const REQUIRED_VARS = [
  "DOCUSIGN_ACCOUNT_ID",
  "DOCUSIGN_BASE_PATH",
  "DOCUSIGN_AUTH_SERVER",
  "DOCUSIGN_INTEGRATION_KEY",
  "DOCUSIGN_USER_ID",
  "DOCUSIGN_PRIVATE_KEY",
] as const;

export function checkEnvPresence(): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const v of REQUIRED_VARS) {
    result[v] = !!process.env[v];
  }
  result["DOCUSIGN_ENV"] = !!process.env.DOCUSIGN_ENV;
  return result;
}

export function loadConfig(): DocuSignEnvConfig {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing DocuSign env vars: ${missing.join(", ")}`);
  }

  const rawKey = process.env.DOCUSIGN_PRIVATE_KEY!;
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const rawBasePath = process.env.DOCUSIGN_BASE_PATH!.replace(/\/+$/, "");

  const env = process.env.DOCUSIGN_ENV === "production" ? "production" : "demo";

  return {
    accountId: process.env.DOCUSIGN_ACCOUNT_ID!,
    basePath: rawBasePath,
    authServer: process.env.DOCUSIGN_AUTH_SERVER!.replace(/\/+$/, ""),
    integrationKey: process.env.DOCUSIGN_INTEGRATION_KEY!,
    userId: process.env.DOCUSIGN_USER_ID!,
    privateKey,
    env,
  };
}
