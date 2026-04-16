import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkOwnerReleaseEligibility,
  performOwnerRelease,
  performAdminRelease,
  performAdminResetOperationalState,
  performAdminVoidAndRelease,
  RELEASE_REASON_CODES,
  VOID_AND_RELEASE_CONFIRMATION,
  type PropertySummary,
  type ThreadSummary,
  type SignaturePacketSummary,
} from "@/lib/property/claimRelease";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProperty(overrides: Partial<PropertySummary> = {}): PropertySummary {
  return {
    id: "prop-1",
    owner_user_id: "user-1",
    admin_hold: false,
    closing_review_status: null,
    ...overrides,
  };
}

function makeThread(
  id: string,
  status: string,
): ThreadSummary {
  return { id, status };
}

function makePacket(id: string, status: string): SignaturePacketSummary {
  return { id, status };
}

// ---------------------------------------------------------------------------
// Pure eligibility tests
// ---------------------------------------------------------------------------

describe("checkOwnerReleaseEligibility", () => {
  it("allows release when property has no deals and no holds", () => {
    const result = checkOwnerReleaseEligibility(makeProperty(), [], []);
    expect(result.allowed).toBe(true);
    expect(result.blockedReasons).toHaveLength(0);
    expect(result.closableThreadIds).toHaveLength(0);
  });

  it("blocks release when admin_hold is set", () => {
    const result = checkOwnerReleaseEligibility(
      makeProperty({ admin_hold: true }),
      [],
      [],
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("admin_hold");
  });

  it("blocks release when accepted (binding) deal thread exists", () => {
    const result = checkOwnerReleaseEligibility(
      makeProperty(),
      [makeThread("t1", "accepted")],
      [],
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("binding_accepted_deal_exists");
  });

  it("blocks release when active signature packet exists (sent)", () => {
    const result = checkOwnerReleaseEligibility(
      makeProperty(),
      [],
      [makePacket("p1", "sent")],
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("active_signature_packet_exists");
  });

  it("blocks release when active signature packet exists (partially_signed)", () => {
    const result = checkOwnerReleaseEligibility(
      makeProperty(),
      [],
      [makePacket("p1", "partially_signed")],
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("active_signature_packet_exists");
  });

  it("blocks release when active signature packet exists (completed)", () => {
    const result = checkOwnerReleaseEligibility(
      makeProperty(),
      [],
      [makePacket("p1", "completed")],
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("active_signature_packet_exists");
  });

  it("does NOT block on declined or voided signature packets", () => {
    const result = checkOwnerReleaseEligibility(
      makeProperty(),
      [],
      [makePacket("p1", "declined"), makePacket("p2", "voided")],
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks release when closing_review_status is pending", () => {
    const result = checkOwnerReleaseEligibility(
      makeProperty({ closing_review_status: "pending" }),
      [],
      [],
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("closing_workflow_active");
  });

  it("blocks release when closing_review_status is issue_found", () => {
    const result = checkOwnerReleaseEligibility(
      makeProperty({ closing_review_status: "issue_found" }),
      [],
      [],
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("closing_workflow_active");
  });

  it("does NOT block when closing_review_status is ready", () => {
    const result = checkOwnerReleaseEligibility(
      makeProperty({ closing_review_status: "ready" }),
      [],
      [],
    );
    expect(result.allowed).toBe(true);
  });

  it("allows release with active non-binding negotiations and returns their IDs as closable", () => {
    const result = checkOwnerReleaseEligibility(
      makeProperty(),
      [
        makeThread("t1", "negotiating"),
        makeThread("t2", "pending_owner"),
        makeThread("t3", "draft"),
      ],
      [],
    );
    expect(result.allowed).toBe(true);
    expect(result.closableThreadIds).toContain("t1");
    expect(result.closableThreadIds).toContain("t2");
    expect(result.closableThreadIds).toContain("t3");
  });

  it("does NOT include already-closed threads in closableThreadIds", () => {
    const result = checkOwnerReleaseEligibility(
      makeProperty(),
      [
        makeThread("t-already-closed", "closed"),
        makeThread("t-claim-release", "closed_due_to_claim_release"),
        makeThread("t-active", "negotiating"),
      ],
      [],
    );
    expect(result.allowed).toBe(true);
    expect(result.closableThreadIds).toEqual(["t-active"]);
  });

  it("accumulates multiple blocked reasons", () => {
    const result = checkOwnerReleaseEligibility(
      makeProperty({ admin_hold: true, closing_review_status: "pending" }),
      [makeThread("t1", "accepted")],
      [makePacket("p1", "sent")],
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("admin_hold");
    expect(result.blockedReasons).toContain("binding_accepted_deal_exists");
    expect(result.blockedReasons).toContain("active_signature_packet_exists");
    expect(result.blockedReasons).toContain("closing_workflow_active");
  });
});

// ---------------------------------------------------------------------------
// RELEASE_REASON_CODES constants
// ---------------------------------------------------------------------------

describe("RELEASE_REASON_CODES", () => {
  it("includes all required reason codes", () => {
    const required = [
      "stale_test_data",
      "erroneous_acceptance",
      "duplicate_property",
      "wrong_owner_attached",
      "support_remediation",
      "compliance_legal_instruction",
      "internal_qa_cleanup",
      "other",
    ];
    for (const code of required) {
      expect(RELEASE_REASON_CODES).toContain(code as any);
    }
  });
});

// ---------------------------------------------------------------------------
// VOID_AND_RELEASE_CONFIRMATION constant
// ---------------------------------------------------------------------------

describe("VOID_AND_RELEASE_CONFIRMATION", () => {
  it("is exactly 'VOID AND RELEASE'", () => {
    expect(VOID_AND_RELEASE_CONFIRMATION).toBe("VOID AND RELEASE");
  });
});

// ---------------------------------------------------------------------------
// Service mutation tests with mocked Supabase client
// ---------------------------------------------------------------------------

function makeMockSvc(overrides: Record<string, any> = {}) {
  const defaultChain = {
    data: null,
    error: null,
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    not: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };

  const chain = { ...defaultChain, ...overrides };

  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

describe("performOwnerRelease", () => {
  it("returns ok:true when all mutations succeed", async () => {
    const chain = {
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
    };

    // Simulate all operations resolving successfully
    let callCount = 0;
    const svc = {
      from: vi.fn((table: string) => {
        return {
          ...chain,
          update: vi.fn().mockReturnValue({
            ...chain,
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          delete: vi.fn().mockReturnValue({
            ...chain,
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          in: vi.fn().mockReturnValue({
            ...chain,
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    };

    const result = await performOwnerRelease("prop-1", "user-1", ["t1", "t2"], svc);
    expect(result.ok).toBe(true);
  });

  it("returns ok:false when properties update fails", async () => {
    const svc = {
      from: vi.fn((table: string) => {
        if (table === "properties") {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: { message: "db error" } }),
            }),
          };
        }
        return {
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
          in: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    };

    const result = await performOwnerRelease("prop-1", "user-1", [], svc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("properties_update_failed");
    }
  });
});

describe("performAdminVoidAndRelease", () => {
  it("returns ok:false when thread is not in accepted status", async () => {
    const svc = {
      from: vi.fn((table: string) => {
        if (table === "deal_threads") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: "t1", status: "negotiating", property_id: "prop-1" },
              error: null,
            }),
            update: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
          };
        }
        return {};
      }),
    };

    const result = await performAdminVoidAndRelease(
      "prop-1",
      "t1",
      "admin-1",
      "stale_test_data",
      "test notes",
      svc,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("thread_not_in_accepted_status");
    }
  });

  it("returns ok:false when thread is not found", async () => {
    const svc = {
      from: vi.fn((table: string) => {
        if (table === "deal_threads") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "no rows" },
            }),
          };
        }
        return {};
      }),
    };

    const result = await performAdminVoidAndRelease(
      "prop-1",
      "t1",
      "admin-1",
      "stale_test_data",
      "test notes",
      svc,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("thread_not_found");
    }
  });
});

describe("performAdminResetOperationalState", () => {
  it("returns ok:true on success", async () => {
    const svc = {
      from: vi.fn((table: string) => {
        if (table === "properties") {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    };

    const result = await performAdminResetOperationalState(
      "prop-1",
      "admin-1",
      "internal_qa_cleanup",
      "test cleanup",
      svc,
    );
    expect(result.ok).toBe(true);
  });

  it("returns ok:false when properties update fails", async () => {
    const svc = {
      from: vi.fn((table: string) => {
        if (table === "properties") {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                error: { message: "update failed" },
              }),
            }),
          };
        }
        return {};
      }),
    };

    const result = await performAdminResetOperationalState(
      "prop-1",
      "admin-1",
      "internal_qa_cleanup",
      null,
      svc,
    );
    expect(result.ok).toBe(false);
  });

  it("does NOT release owner linkage (claim stays intact)", async () => {
    const updatedPayloads: any[] = [];

    const svc = {
      from: vi.fn((table: string) => {
        if (table === "properties") {
          return {
            update: vi.fn().mockImplementation((payload: any) => {
              updatedPayloads.push(payload);
              return {
                eq: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        }
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    };

    await performAdminResetOperationalState(
      "prop-1",
      "admin-1",
      "stale_test_data",
      "note",
      svc,
    );

    // owner_user_id must NOT be in the reset payload
    expect(updatedPayloads.length).toBeGreaterThan(0);
    expect(updatedPayloads[0]).not.toHaveProperty("owner_user_id");
  });
});
