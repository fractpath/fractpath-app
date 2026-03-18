import { describe, it, expect } from "vitest";
import {
  isSignaturePacketStatus,
  isSignatureProvider,
  isSignatureRecipientRole,
  isTerminalPacketStatus,
  isInFlightPacketStatus,
  canPacketBeSuperseded,
  mapDocuSignStatusToLocal,
  SIGNATURE_PACKET_STATUSES,
  SIGNATURE_RECIPIENT_ROLES,
  SIGNATURE_PROVIDERS,
} from "../signature/status";

describe("isSignaturePacketStatus", () => {
  it("accepts all valid statuses", () => {
    for (const s of SIGNATURE_PACKET_STATUSES) {
      expect(isSignaturePacketStatus(s)).toBe(true);
    }
  });

  it("rejects unknown strings", () => {
    expect(isSignaturePacketStatus("pending")).toBe(false);
    expect(isSignaturePacketStatus("countered")).toBe(false);
    expect(isSignaturePacketStatus("")).toBe(false);
    expect(isSignaturePacketStatus(null)).toBe(false);
    expect(isSignaturePacketStatus(42)).toBe(false);
  });
});

describe("isSignatureProvider", () => {
  it("accepts docusign", () => {
    expect(isSignatureProvider("docusign")).toBe(true);
  });

  it("rejects others", () => {
    expect(isSignatureProvider("hellosign")).toBe(false);
    expect(isSignatureProvider("")).toBe(false);
    expect(isSignatureProvider(null)).toBe(false);
  });
});

describe("isSignatureRecipientRole", () => {
  it("accepts Buyer and Owner", () => {
    for (const r of SIGNATURE_RECIPIENT_ROLES) {
      expect(isSignatureRecipientRole(r)).toBe(true);
    }
  });

  it("rejects case variants and unknowns", () => {
    expect(isSignatureRecipientRole("buyer")).toBe(false);
    expect(isSignatureRecipientRole("owner")).toBe(false);
    expect(isSignatureRecipientRole("Realtor")).toBe(false);
    expect(isSignatureRecipientRole("")).toBe(false);
  });
});

describe("isTerminalPacketStatus", () => {
  it("marks completed, declined, voided as terminal", () => {
    expect(isTerminalPacketStatus("completed")).toBe(true);
    expect(isTerminalPacketStatus("declined")).toBe(true);
    expect(isTerminalPacketStatus("voided")).toBe(true);
  });

  it("does not mark in-flight or error statuses as terminal", () => {
    expect(isTerminalPacketStatus("sent")).toBe(false);
    expect(isTerminalPacketStatus("delivered")).toBe(false);
    expect(isTerminalPacketStatus("partially_signed")).toBe(false);
    expect(isTerminalPacketStatus("prepared")).toBe(false);
    expect(isTerminalPacketStatus("error")).toBe(false);
  });
});

describe("isInFlightPacketStatus", () => {
  it("marks sent, delivered, partially_signed as in-flight", () => {
    expect(isInFlightPacketStatus("sent")).toBe(true);
    expect(isInFlightPacketStatus("delivered")).toBe(true);
    expect(isInFlightPacketStatus("partially_signed")).toBe(true);
  });

  it("does not mark terminal or pre-send statuses as in-flight", () => {
    expect(isInFlightPacketStatus("prepared")).toBe(false);
    expect(isInFlightPacketStatus("completed")).toBe(false);
    expect(isInFlightPacketStatus("declined")).toBe(false);
    expect(isInFlightPacketStatus("voided")).toBe(false);
    expect(isInFlightPacketStatus("error")).toBe(false);
  });
});

describe("canPacketBeSuperseded", () => {
  it("allows superseding prepared and error packets", () => {
    expect(canPacketBeSuperseded("prepared")).toBe(true);
    expect(canPacketBeSuperseded("error")).toBe(true);
  });

  it("disallows superseding in-flight packets", () => {
    expect(canPacketBeSuperseded("sent")).toBe(false);
    expect(canPacketBeSuperseded("delivered")).toBe(false);
    expect(canPacketBeSuperseded("partially_signed")).toBe(false);
  });

  it("disallows superseding terminal packets", () => {
    expect(canPacketBeSuperseded("completed")).toBe(false);
    expect(canPacketBeSuperseded("declined")).toBe(false);
    expect(canPacketBeSuperseded("voided")).toBe(false);
  });
});

describe("mapDocuSignStatusToLocal", () => {
  const mapping: Array<[string, string]> = [
    ["created",   "prepared"],
    ["sent",      "sent"],
    ["delivered", "delivered"],
    ["completed", "completed"],
    ["declined",  "declined"],
    ["voided",    "voided"],
  ];

  it.each(mapping)('maps "%s" → "%s"', (input, expected) => {
    expect(mapDocuSignStatusToLocal(input)).toBe(expected);
  });

  it("returns null for unknown provider statuses", () => {
    expect(mapDocuSignStatusToLocal("signing_complete")).toBeNull();
    expect(mapDocuSignStatusToLocal("")).toBeNull();
    expect(mapDocuSignStatusToLocal("unknown_status")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(mapDocuSignStatusToLocal("COMPLETED")).toBe("completed");
    expect(mapDocuSignStatusToLocal("Voided")).toBe("voided");
  });
});

describe("provider constant coverage", () => {
  it("SIGNATURE_PROVIDERS contains docusign", () => {
    expect(SIGNATURE_PROVIDERS).toContain("docusign");
  });

  it("SIGNATURE_RECIPIENT_ROLES contains both roles", () => {
    expect(SIGNATURE_RECIPIENT_ROLES).toContain("Buyer");
    expect(SIGNATURE_RECIPIENT_ROLES).toContain("Owner");
    expect(SIGNATURE_RECIPIENT_ROLES).toHaveLength(2);
  });

  it("SIGNATURE_PACKET_STATUSES has 8 entries", () => {
    expect(SIGNATURE_PACKET_STATUSES).toHaveLength(8);
  });
});
