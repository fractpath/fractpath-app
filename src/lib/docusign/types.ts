// ============================================================
// Core config shape — used by auth, client, and health route
// ============================================================
export type DocuSignEnvConfig = {
  accountId: string;
  basePath: string;
  authServer: string;
  integrationKey: string;
  userId: string;
  privateKey: string;
  env: "demo" | "production";
  /** DocuSign template ID for the Active Deal signature packet (MVP). */
  templateIdActiveDeal: string;
  /** Optional brand ID applied to envelopes. */
  brandId?: string;
};

// ============================================================
// Auth / token shapes
// ============================================================
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

// ============================================================
// Envelope shapes (minimal — expanded in Prompt 2)
// ============================================================

export interface DocuSignRecipientSigner {
  name: string;
  email: string;
  recipientId: string;
  routingOrder: string;
  /** Optional: populate from template role name */
  roleName?: string;
  clientUserId?: string;
}

export interface DocuSignEnvelopeDefinition {
  templateId: string;
  status: "created" | "sent";
  templateRoles: DocuSignRecipientSigner[];
  emailSubject?: string;
  brandId?: string;
}

export interface DocuSignEnvelopeSummary {
  envelopeId: string;
  status: string;
  statusDateTime?: string;
  uri?: string;
}

export interface DocuSignEnvelopeDetail extends DocuSignEnvelopeSummary {
  emailSubject?: string;
  sentDateTime?: string;
  completedDateTime?: string;
  voidedDateTime?: string;
  declinedDateTime?: string;
}

export interface DocuSignRecipientDetail {
  recipientId: string;
  name: string;
  email: string;
  status: string;
  signedDateTime?: string;
  roleName?: string;
  routingOrder?: string;
}

export interface DocuSignRecipientsResponse {
  signers?: DocuSignRecipientDetail[];
}

export interface DocuSignDocumentDetail {
  documentId: string;
  name: string;
  type?: string;
  uri?: string;
}

export interface DocuSignEnvelopeDocumentsResponse {
  envelopeDocuments?: DocuSignDocumentDetail[];
  envelopeId?: string;
}

// ============================================================
// createEnvelopeFromTemplate input
// ============================================================
export interface CreateEnvelopeFromTemplateInput {
  templateId: string;
  emailSubject: string;
  buyer: { name: string; email: string };
  owner: { name: string; email: string };
  /** Defaults to "sent". Use "created" to prepare without sending. */
  sendMode?: "sent" | "created";
  brandId?: string;
}
