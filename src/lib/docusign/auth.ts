import type { DocuSignEnvConfig, DocuSignTokenResult } from "./types";

// ============================================================
// In-memory token cache (simple — safe for single-process server)
// ============================================================
let _cachedToken: DocuSignTokenResult | null = null;
let _cachedTokenExpiry = 0; // Unix seconds

const TOKEN_BUFFER_SECONDS = 120; // refresh 2 min before expiry

/**
 * Returns a valid DocuSign access token, using the in-memory cache
 * when the token is still valid.  Falls through to JWT grant if not.
 */
export async function getDocusignAccessToken(
  config: DocuSignEnvConfig,
): Promise<DocuSignTokenResult> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (_cachedToken && nowSeconds < _cachedTokenExpiry - TOKEN_BUFFER_SECONDS) {
    return _cachedToken;
  }
  const result = await getJwtToken(config);
  _cachedToken = result;
  _cachedTokenExpiry = nowSeconds + result.expires_in;
  return result;
}

/**
 * Performs a DocuSign JWT Bearer grant and returns the token response.
 * Errors do NOT include secret values (key, token) in the message.
 */
export async function getJwtToken(
  config: DocuSignEnvConfig,
): Promise<DocuSignTokenResult> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: config.integrationKey,
    sub: config.userId,
    aud: config.authServer.replace(/^https?:\/\//, ""),
    iat: now,
    exp,
    scope: "signature impersonation",
  };

  const crypto = await import("crypto");

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const keyObject = crypto.createPrivateKey({
    key: config.privateKey,
    format: "pem",
  });

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign(keyObject, "base64url");

  const jwt = `${signingInput}.${signature}`;

  const tokenUrl = `${config.authServer}/oauth/token`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });

  let res: Response;
  try {
    res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (networkErr) {
    throw new Error(
      `DocuSign JWT auth: network error reaching ${tokenUrl}. ` +
      `Check DOCUSIGN_AUTH_SERVER. Details: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`
    );
  }

  const rawBody = await res.text();

  if (!res.ok) {
    // Log status + body excerpt; never log the JWT assertion or private key
    console.error("docusign_jwt_auth_error", {
      status: res.status,
      body: rawBody.slice(0, 400),
    });
    throw new Error(
      `DocuSign JWT auth failed (HTTP ${res.status}). ` +
      `Ensure the integration key has user consent and the key pair is valid.`
    );
  }

  const result = JSON.parse(rawBody) as DocuSignTokenResult;

  console.log("docusign_jwt_auth_ok", {
    tokenType: result.token_type,
    expiresIn: result.expires_in,
  });

  return result;
}

function base64url(str: string): string {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
