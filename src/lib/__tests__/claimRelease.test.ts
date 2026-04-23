import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkOwnerReleaseEligibility,
  performOwnerRelease,
  performAdminRelease,
  performAdminResetOperationalState,
  performAdminVoidAndRelease,
  RELEASE_REASON_CODES,
  VOID_AND_RELEASE_CONFIRMATION,
  VOIDABLE_SIGNATURE_STATUSES,
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

function makeThread(id: string, status: string): ThreadSummary {
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
// VOIDABLE_SIGNATURE_STATUSES
// ---------------------------------------------------------------------------

describe("VOIDABLE_SIGNATURE_STATUSES", () => {
  it("includes in-flight statuses but NOT completed or terminal ones", () => {
    expect(VOIDABLE_SIGNATURE_STATUSES.has("prepared")).toBe(true);
    expect(VOIDABLE_SIGNATURE_STATUSES.has("sent")).toBe(true);
    expect(VOIDABLE_SIGNATURE_STATUSES.has("delivered")).toBe(true);
    expect(VOIDABLE_SIGNATURE_STATUSES.has("partially_signed")).toBe(true);
    expect(VOIDABLE_SIGNATURE_STATUSES.has("completed")).toBe(false);
    expect(VOIDABLE_SIGNATURE_STATUSES.has("voided")).toBe(false);
    expect(VOIDABLE_SIGNATURE_STATUSES.has("declined")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Service mutation tests with mocked Supabase client
// ---------------------------------------------------------------------------

/**
 * Build a mock Supabase service client that can be customized per table.
 * Each table returns a chainable object whose terminal calls resolve to { data, error }.
 */
function buildSvc(tableHandlers: Record<string, () => any>) {
  return {
    from: vi.fn((table: string) => {
      if (tableHandlers[table]) return tableHandlers[table]();
      // Default: no-op chain that succeeds
      const noop = {
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ error: null }),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      Object.assign(noop, { data: null, error: null });
      // Make terminal calls resolve successfully
      noop.eq = vi.fn().mockResolvedValue({ data: null, error: null });
      return noop;
    }),
  };
}

/** Chain where every terminal operation resolves to `{ data, error: null }` */
function successChain(data: any = null) {
  const chain: any = {
    data,
    error: null,
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ data, error: null }),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    limit: vi.fn().mockReturnThis(),
  };
  // Make the final chain call resolve
  chain.eq = vi.fn().mockReturnThis();
  chain.in = vi.fn().mockReturnThis();
  chain.is = vi.fn().mockReturnThis();
  // The actual terminal call in Supabase is awaiting the builder
  // We use a Proxy so any final await resolves to { data, error: null }
  return new Proxy(chain, {
    get(target, prop) {
      if (prop === "then") {
        return (resolve: any) => resolve({ data, error: null });
      }
      return target[prop] ?? vi.fn().mockReturnThis();
    },
  });
}

// ---------------------------------------------------------------------------
// performOwnerRelease
// ---------------------------------------------------------------------------

describe("performOwnerRelease", () => {
  it("returns ok:true when all mutations succeed", async () => {
    // Track which tables were called
    const called: string[] = [];

    const svc = {
      from: vi.fn((table: string) => {
        called.push(table);
        return new Proxy({}, {
          get(_target, prop) {
            if (prop === "then") {
              return (resolve: any) => resolve({ data: null, error: null });
            }
            return vi.fn().mockReturnThis();
          },
        });
      }),
    };

    const result = await performOwnerRelease("prop-1", "user-1", ["t1", "t2"], svc);
    expect(result.ok).toBe(true);
    // Should have touched properties, deal_threads, property_documents, property_photos, property_claim_events
    expect(called).toContain("properties");
    expect(called).toContain("property_documents");
    expect(called).toContain("property_photos");
    expect(called).toContain("property_claim_events");
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
        return new Proxy({}, {
          get(_t, p) {
            if (p === "then") return (r: any) => r({ data: null, error: null });
            return vi.fn().mockReturnThis();
          },
        });
      }),
    };

    const result = await performOwnerRelease("prop-1", "user-1", [], svc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("properties_update_failed");
    }
  });

  it("sets ownership_status to 'unclaimed' and nulls claimed_by_user_id", async () => {
    const propertyUpdates: any[] = [];

    const svc = {
      from: vi.fn((table: string) => {
        if (table === "properties") {
          return {
            update: vi.fn().mockImplementation((payload: any) => {
              propertyUpdates.push(payload);
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }
        return new Proxy({}, {
          get(_t, p) {
            if (p === "then") return (r: any) => r({ data: null, error: null });
            return vi.fn().mockReturnThis();
          },
        });
      }),
    };

    await performOwnerRelease("prop-1", "user-1", [], svc);
    expect(propertyUpdates.length).toBeGreaterThan(0);
    expect(propertyUpdates[0]).toHaveProperty("ownership_status", "unclaimed");
    expect(propertyUpdates[0]).toHaveProperty("claimed_by_user_id", null);
    expect(propertyUpdates[0]).toHaveProperty("owner_user_id", null);
  });

  it("soft-deletes property_photos (sets removed_at) rather than hard-deleting", async () => {
    const photoUpdates: any[] = [];

    const svc = {
      from: vi.fn((table: string) => {
        if (table === "property_photos") {
          return {
            update: vi.fn().mockImplementation((payload: any) => {
              photoUpdates.push(payload);
              return {
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockResolvedValue({ error: null }),
                }),
              };
            }),
          };
        }
        return new Proxy({}, {
          get(_t, p) {
            if (p === "then") return (r: any) => r({ data: null, error: null });
            return vi.fn().mockReturnThis();
          },
        });
      }),
    };

    await performOwnerRelease("prop-1", "user-1", [], svc);
    expect(photoUpdates.length).toBeGreaterThan(0);
    expect(photoUpdates[0]).toHaveProperty("removed_at");
    expect(photoUpdates[0]).toHaveProperty("removed_by", "user-1");
  });
});

// ---------------------------------------------------------------------------
// performAdminRelease
// ---------------------------------------------------------------------------

describe("performAdminRelease", () => {
  it("soft-deletes property_photos during admin release", async () => {
    const photoUpdates: any[] = [];

    const svc = {
      from: vi.fn((table: string) => {
        if (table === "property_photos") {
          return {
            update: vi.fn().mockImplementation((payload: any) => {
              photoUpdates.push(payload);
              return {
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockResolvedValue({ error: null }),
                }),
              };
            }),
          };
        }
        return new Proxy({}, {
          get(_t, p) {
            if (p === "then") return (r: any) => r({ data: null, error: null });
            return vi.fn().mockReturnThis();
          },
        });
      }),
    };

    const result = await performAdminRelease(
      "prop-1",
      "admin-1",
      "stale_test_data",
      "note",
      [],
      svc,
    );
    expect(result.ok).toBe(true);
    expect(photoUpdates.length).toBeGreaterThan(0);
    expect(photoUpdates[0]).toHaveProperty("removed_at");
  });

  it("sets ownership_status to 'unclaimed' and nulls claimed_by_user_id", async () => {
    const propertyUpdates: any[] = [];

    const svc = {
      from: vi.fn((table: string) => {
        if (table === "properties") {
          return {
            update: vi.fn().mockImplementation((payload: any) => {
              propertyUpdates.push(payload);
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }
        return new Proxy({}, {
          get(_t, p) {
            if (p === "then") return (r: any) => r({ data: null, error: null });
            return vi.fn().mockReturnThis();
          },
        });
      }),
    };

    const result = await performAdminRelease("prop-1", "admin-1", "stale_test_data", null, [], svc);
    expect(result.ok).toBe(true);
    expect(propertyUpdates.length).toBeGreaterThan(0);
    expect(propertyUpdates[0]).toHaveProperty("ownership_status", "unclaimed");
    expect(propertyUpdates[0]).toHaveProperty("claimed_by_user_id", null);
    expect(propertyUpdates[0]).toHaveProperty("owner_user_id", null);
  });
});

// ---------------------------------------------------------------------------
// performAdminVoidAndRelease
// ---------------------------------------------------------------------------

describe("performAdminVoidAndRelease", () => {
  /**
   * Build a mock svc for void+release where deal_threads queries are stateful:
   * - First call returns the accepted threads list
   * - Subsequent calls return sibling threads (empty by default)
   */
  function buildVoidAndReleaseSvc({
    acceptedThreads = [{ id: "t1", status: "accepted", property_id: "prop-1" }],
    acceptedThreadsError = null,
    siblingThreads = [],
    voidError = null,
    propertiesError = null,
  }: {
    acceptedThreads?: any[];
    acceptedThreadsError?: any;
    siblingThreads?: any[];
    voidError?: any;
    propertiesError?: any;
  } = {}) {
    let dealThreadsCallCount = 0;

    return {
      from: vi.fn((table: string) => {
        if (table === "deal_threads") {
          dealThreadsCallCount++;
          const callIdx = dealThreadsCallCount;

          if (callIdx === 1) {
            // First call: load accepted threads
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: acceptedThreadsError ? null : acceptedThreads,
                    error: acceptedThreadsError,
                  }),
                }),
              }),
            };
          }
          if (callIdx === 2) {
            // Second call: void all accepted threads
            return {
              update: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ error: voidError }),
              }),
            };
          }
          // Third call: load sibling threads
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: siblingThreads, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }

        if (table === "deal_signature_packets") {
          return {
            update: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          };
        }

        if (table === "properties") {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: propertiesError }),
            }),
          };
        }

        return new Proxy({}, {
          get(_t, p) {
            if (p === "then") return (r: any) => r({ data: null, error: null });
            return vi.fn().mockReturnThis();
          },
        });
      }),
    };
  }

  it("returns ok:true when all mutations succeed with a single accepted thread", async () => {
    const svc = buildVoidAndReleaseSvc();
    const result = await performAdminVoidAndRelease(
      "prop-1",
      "t1",
      "admin-1",
      "stale_test_data",
      "test notes",
      svc,
    );
    expect(result.ok).toBe(true);
  });

  it("returns no_accepted_threads_found when there are no accepted threads for the property", async () => {
    const svc = buildVoidAndReleaseSvc({ acceptedThreads: [] });
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
      expect(result.error).toBe("no_accepted_threads_found");
    }
  });

  it("returns primary_thread_not_in_accepted_status when primary thread ID is not in the accepted set", async () => {
    const svc = buildVoidAndReleaseSvc({
      // Only t-other is accepted, t1 (primary) is not
      acceptedThreads: [{ id: "t-other", status: "accepted", property_id: "prop-1" }],
    });
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
      expect(result.error).toBe("primary_thread_not_in_accepted_status");
    }
  });

  it("returns load_accepted_threads_failed when the DB query errors", async () => {
    const svc = buildVoidAndReleaseSvc({
      acceptedThreadsError: { message: "connection error" },
    });
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
      expect(result.error).toContain("load_accepted_threads_failed");
    }
  });

  it("voids ALL accepted threads, not just the primary one", async () => {
    const voidedIds: string[][] = [];
    let dealThreadsCallCount = 0;

    const svc = {
      from: vi.fn((table: string) => {
        if (table === "deal_threads") {
          dealThreadsCallCount++;
          if (dealThreadsCallCount === 1) {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: [
                      { id: "t1", status: "accepted", property_id: "prop-1" },
                      { id: "t2", status: "accepted", property_id: "prop-1" },
                      { id: "t3", status: "accepted", property_id: "prop-1" },
                    ],
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (dealThreadsCallCount === 2) {
            return {
              update: vi.fn().mockReturnValue({
                in: vi.fn().mockImplementation((_column: string, ids: string[]) => {
                  voidedIds.push(ids);
                  return Promise.resolve({ error: null });
                }),
              }),
            };
          }
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        return new Proxy({}, {
          get(_t, p) {
            if (p === "then") return (r: any) => r({ data: null, error: null });
            return vi.fn().mockReturnThis();
          },
        });
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
    expect(result.ok).toBe(true);
    expect(voidedIds.length).toBeGreaterThan(0);
    const allVoided = voidedIds.flat();
    expect(allVoided).toContain("t1");
    expect(allVoided).toContain("t2");
    expect(allVoided).toContain("t3");
  });

  it("returns void_threads_failed when the void update fails", async () => {
    const svc = buildVoidAndReleaseSvc({
      voidError: { message: "constraint violation" },
    });
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
      expect(result.error).toContain("void_threads_failed");
    }
  });

  it("returns properties_update_failed when property purge fails", async () => {
    const svc = buildVoidAndReleaseSvc({
      propertiesError: { message: "update failed" },
    });
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
      expect(result.error).toContain("properties_update_failed");
    }
  });

  it("terminates in-flight signature packets for voided threads", async () => {
    const packetVoids: any[] = [];
    let dealThreadsCallCount = 0;

    const svc = {
      from: vi.fn((table: string) => {
        if (table === "deal_threads") {
          dealThreadsCallCount++;
          if (dealThreadsCallCount === 1) {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: [{ id: "t1", status: "accepted", property_id: "prop-1" }],
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
                in: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }

        if (table === "deal_signature_packets") {
          return {
            update: vi.fn().mockImplementation((payload: any) => {
              packetVoids.push(payload);
              return {
                in: vi.fn().mockReturnValue({
                  in: vi.fn().mockResolvedValue({ error: null }),
                }),
              };
            }),
          };
        }

        return new Proxy({}, {
          get(_t, p) {
            if (p === "then") return (r: any) => r({ data: null, error: null });
            return vi.fn().mockReturnThis();
          },
        });
      }),
    };

    await performAdminVoidAndRelease(
      "prop-1",
      "t1",
      "admin-1",
      "stale_test_data",
      "test notes",
      svc,
    );

    expect(packetVoids.length).toBeGreaterThan(0);
    expect(packetVoids[0]).toHaveProperty("status", "voided");
    expect(packetVoids[0]).toHaveProperty("voided_at");
  });

  it("soft-deletes property_photos during void+release", async () => {
    const photoUpdates: any[] = [];
    let dealThreadsCallCount = 0;

    const svc = {
      from: vi.fn((table: string) => {
        if (table === "deal_threads") {
          dealThreadsCallCount++;
          if (dealThreadsCallCount === 1) {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: [{ id: "t1", status: "accepted", property_id: "prop-1" }],
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }

        if (table === "property_photos") {
          return {
            update: vi.fn().mockImplementation((payload: any) => {
              photoUpdates.push(payload);
              return {
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockResolvedValue({ error: null }),
                }),
              };
            }),
          };
        }

        return new Proxy({}, {
          get(_t, p) {
            if (p === "then") return (r: any) => r({ data: null, error: null });
            return vi.fn().mockReturnThis();
          },
        });
      }),
    };

    await performAdminVoidAndRelease(
      "prop-1",
      "t1",
      "admin-1",
      "stale_test_data",
      "test notes",
      svc,
    );

    expect(photoUpdates.length).toBeGreaterThan(0);
    expect(photoUpdates[0]).toHaveProperty("removed_at");
    expect(photoUpdates[0]).toHaveProperty("removed_by", "admin-1");
  });

  it("nulls out owner_user_id in the property purge payload", async () => {
    const propertyUpdates: any[] = [];
    let dealThreadsCallCount = 0;

    const svc = {
      from: vi.fn((table: string) => {
        if (table === "deal_threads") {
          dealThreadsCallCount++;
          if (dealThreadsCallCount === 1) {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: [{ id: "t1", status: "accepted", property_id: "prop-1" }],
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }

        if (table === "properties") {
          return {
            update: vi.fn().mockImplementation((payload: any) => {
              propertyUpdates.push(payload);
              return {
                eq: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        }

        return new Proxy({}, {
          get(_t, p) {
            if (p === "then") return (r: any) => r({ data: null, error: null });
            return vi.fn().mockReturnThis();
          },
        });
      }),
    };

    await performAdminVoidAndRelease(
      "prop-1",
      "t1",
      "admin-1",
      "stale_test_data",
      "test notes",
      svc,
    );

    expect(propertyUpdates.length).toBeGreaterThan(0);
    expect(propertyUpdates[0]).toHaveProperty("owner_user_id", null);
    expect(propertyUpdates[0]).toHaveProperty("ownership_status", "unclaimed");
    expect(propertyUpdates[0]).toHaveProperty("claimed_by_user_id", null);
    expect(propertyUpdates[0]).toHaveProperty("claim_released_at");
    expect(propertyUpdates[0]).toHaveProperty("verification_state", "intake_pending");
  });
});

// ---------------------------------------------------------------------------
// performAdminResetOperationalState
// ---------------------------------------------------------------------------

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

  it("does NOT release owner linkage or touch deal threads", async () => {
    const updatedPayloads: any[] = [];
    const fromCalls: string[] = [];

    const svc = {
      from: vi.fn((table: string) => {
        fromCalls.push(table);
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
    // Should NOT touch deal_threads or property_photos
    expect(fromCalls).not.toContain("deal_threads");
    expect(fromCalls).not.toContain("property_photos");
    expect(fromCalls).not.toContain("property_documents");
  });
});
