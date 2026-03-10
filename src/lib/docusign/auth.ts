import type { DocuSignEnvConfig, DocuSignTokenResult } from "./types";

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

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(config.privateKey, "base64url");

  const jwt = `${signingInput}.${signature}`;

  const tokenUrl = `${config.authServer}/oauth/token`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const rawBody = await res.text();

  if (!res.ok) {
    console.error("docusign_jwt_auth_error", {
      status: res.status,
      body: rawBody,
    });
    throw new Error(`DocuSign JWT auth failed (${res.status}): ${rawBody}`);
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
