export type DocuSignEnvConfig = {
  accountId: string;
  basePath: string;
  authServer: string;
  integrationKey: string;
  userId: string;
  privateKey: string;
  env: "demo" | "production";
};

export type DocuSignTokenResult = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export type DocuSignHealthResult = {
  ok: boolean;
  envPresent: Record<string, boolean>;
  jwtAuth: { ok: boolean; error?: string };
  accountInfo?: { accountName?: string; email?: string };
  error?: string;
};
