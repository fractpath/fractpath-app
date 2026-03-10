import type { DocuSignEnvConfig } from "./types";

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

export async function apiGet(
  config: DocuSignEnvConfig,
  accessToken: string,
  path: string,
): Promise<any> {
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
  body: any,
): Promise<any> {
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
    throw new Error(
      `DocuSign API POST ${path} failed (${res.status}): ${rawBody}`,
    );
  }

  return res.json();
}
