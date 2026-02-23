export type DealGrantRole = "OWNER" | "VIEWER" | "COUNTERPARTY";

export function isRealtorPersona(user: { user_metadata?: Record<string, unknown> } | null | undefined): boolean {
  if (!user?.user_metadata) return false;
  const role = user.user_metadata.role ?? user.user_metadata.persona;
  return role === "realtor";
}

export function assertNotRealtor(
  user: { user_metadata?: Record<string, unknown> } | null | undefined,
): { ok: true } | { ok: false; error: string; status: number } {
  if (isRealtorPersona(user)) {
    return { ok: false, error: "Forbidden (realtor is view-only)", status: 403 };
  }
  return { ok: true };
}

export function assertOwnerGrant(
  grantRole: string | null | undefined,
): { ok: true } | { ok: false; error: string; status: number } {
  if (grantRole !== "OWNER") {
    return { ok: false, error: "Forbidden (OWNER only)", status: 403 };
  }
  return { ok: true };
}
