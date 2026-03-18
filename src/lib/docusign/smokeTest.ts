/**
 * DocuSign token acquisition smoke test.
 *
 * This is a DEVELOPER UTILITY only — not wired to any public route.
 * Run from a trusted server terminal to verify env var configuration.
 *
 * Usage (from workspace root):
 *   npx tsx src/lib/docusign/smokeTest.ts
 *
 * What it does:
 *   1. Loads and validates env vars via loadConfig()
 *   2. Attempts a JWT Bearer grant
 *   3. Fetches userinfo to confirm the token works
 *   4. Logs safe confirmation (no secret values printed)
 */

import { loadConfig } from "./config";
import { getJwtToken } from "./auth";
import { getUserInfo } from "./client";

async function runSmoke(): Promise<void> {
  console.log("=== DocuSign smoke test starting ===");

  // Step 1: config
  let config;
  try {
    config = loadConfig();
    console.log("[smoke] Config loaded OK", {
      accountId: config.accountId,
      env: config.env,
      authServer: config.authServer,
      templateIdActiveDeal: config.templateIdActiveDeal,
      brandId: config.brandId ?? "(not set)",
    });
  } catch (err) {
    console.error("[smoke] Config load FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // Step 2: JWT token
  let token;
  try {
    token = await getJwtToken(config);
    console.log("[smoke] JWT grant OK", {
      tokenType: token.token_type,
      expiresIn: token.expires_in,
      // access_token intentionally NOT logged
    });
  } catch (err) {
    console.error("[smoke] JWT grant FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // Step 3: userinfo
  try {
    const userInfo = await getUserInfo(config, token.access_token);
    console.log("[smoke] UserInfo OK", {
      name: userInfo.name ?? "(no name)",
      email: userInfo.email ?? "(no email)",
    });
  } catch (err) {
    // Non-fatal — token could be valid but userinfo endpoint unreachable
    console.warn("[smoke] UserInfo fetch failed (non-fatal):", err instanceof Error ? err.message : err);
  }

  console.log("=== DocuSign smoke test PASSED ===");
}

runSmoke().catch((err) => {
  console.error("[smoke] Unexpected error:", err);
  process.exit(1);
});
