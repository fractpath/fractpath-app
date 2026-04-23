"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useToast } from "@/components/ui/Toast";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { Modal } from "@/components/ui/Modal";
import { PropertyForm } from "@/components/properties/PropertyForm";

type PropertyStatus = "unverified" | "under_review" | "verified" | "archived";
type PropertyVisibility = "owned" | "created" | "claimable";

type Property = {
  id: string;
  address_line1: string;
  address_line2: string | null;
  city: string | null;
  state: string;
  postal_code: string;
  address_display: string;
  status: PropertyStatus;
  is_private: boolean;
  visibility?: PropertyVisibility;
  claim_thread_id?: string | null;
  claim_deal_id?: string | null;
  claim_thread_status?: string | null;
  has_owner_invite?: boolean;
  // Enrichment thumbnail — merged in by API from property_enrichments
  cover_image_url?: string | null;
  // Owner hero photo — priority over vendor enrichment thumbnail
  hero_photo_url?: string | null;
  // Review request status — set when an open/submitted request exists for a linked deal
  review_request_status?: "open" | "submitted" | null;
  // Proposal preferences
  proposal_interest_status?: string | null;
  visibility_preference?: string | null;
  // Sprint 16 intake fields
  ownership_type?: string | null;
  occupancy_use?: string | null;
  occupancy_use_other?: string | null;
  major_condition_issue?: string | null;
  major_condition_issue_details?: string | null;
  known_liens_and_claims?: string[] | null;
  total_known_debt_amount?: number | null;
  total_known_debt_confidence?: string | null;
  debt_statement_availability?: string | null;
  title_claims_known?: string | null;
  title_claims_details?: string | null;
  owner_stated_fmv?: number | null;
  owner_stated_fmv_confidence?: string | null;
  owner_stated_fmv_source?: string | null;
  owner_stated_fmv_source_other?: string | null;
  willing_to_proceed_formal_review?: string | null;
};

const STATUS_BADGE: Record<
  PropertyStatus,
  { label: string; className: string; hint: string; icon?: "check" }
> = {
  unverified: {
    label: "Unverified",
    className: "bg-yellow-100 text-yellow-800",
    hint: "Not yet reviewed by FractPath",
  },
  under_review: {
    label: "Under review",
    className: "bg-blue-100 text-blue-800",
    hint: "Being reviewed",
  },
  verified: {
    label: "Verified",
    className: "bg-emerald-100 text-emerald-800 border border-emerald-200",
    hint: "Approved for participation",
    icon: "check",
  },
  archived: {
    label: "Archived",
    className: "bg-gray-100 text-gray-600",
    hint: "No longer active",
  },
};

function canArchive(
  status: PropertyStatus,
  visibility?: PropertyVisibility,
): boolean {
  if (visibility === "claimable") return false;
  return status === "unverified" || status === "verified";
}

function canEdit(
  status: PropertyStatus,
  visibility?: PropertyVisibility,
): boolean {
  if (visibility === "claimable") return false;
  return status === "unverified";
}

export function PropertyList() {
  const t = useToast();
  const [items, setItems] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Property | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [verifyTarget, setVerifyTarget] = useState<Property | null>(null);
  const [notMyPropertyId, setNotMyPropertyId] = useState<string | null>(null);
  const [notMyPropertyConfirmOpen, setNotMyPropertyConfirmOpen] = useState(false);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [releaseClaimTarget, setReleaseClaimTarget] = useState<Property | null>(null);
  const [releasing, setReleasing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/me/properties");
      const json = await res.json().catch(() => null);
      if (!res.ok) return t.error(json?.error || "Couldn't load properties.");
      setItems(json?.properties ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function archiveNow(id: string) {
    if (archiving) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/me/properties/${id}/archive`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        return t.error(json?.error || "Couldn't archive that — try again.");
      }
      t.success("Archived.");
      setArchiveId(null);
      await load();
    } finally {
      setArchiving(false);
    }
  }

  async function claimNow(p: Property) {
    if (!p.claim_thread_id || claimingId) return;
    setClaimingId(p.id);
    try {
      const res = await fetch(
        `/api/threads/${p.claim_thread_id}/claim-property`,
        {
          method: "POST",
        },
      );
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        t.error(json?.error || "Couldn't claim this property.");
        return;
      }

      t.success("Property claimed. Complete verification to continue.");
      await load();

      const claimed = {
        ...p,
        visibility: "owned" as const,
      };
      setVerifyTarget(claimed);
    } finally {
      setClaimingId(null);
    }
  }

  async function declineOwnership(threadId: string) {
    if (decliningId) return;
    setDecliningId(threadId);
    try {
      const res = await fetch(`/api/threads/${threadId}/not-my-property`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        t.error(json?.error || "Couldn't process your response — try again.");
        return;
      }
      t.success("Response recorded. This property has been removed from your list.");
      setNotMyPropertyId(null);
      setNotMyPropertyConfirmOpen(false);
      await load();
    } finally {
      setDecliningId(null);
    }
  }

  async function releaseClaimNow(propertyId: string) {
    if (releasing) return;
    setReleasing(true);
    try {
      const res = await fetch(`/api/me/properties/${propertyId}/release-claim`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const reasons: string[] = json?.details?.blocked_reasons ?? [];
        const detail = reasons.length > 0 ? ` Reason: ${reasons.join(", ")}.` : "";
        t.error(`Release not permitted.${detail}`);
        setReleaseClaimTarget(null);
        return;
      }
      t.success("Claim released. The property has been removed from your account.");
      setReleaseClaimTarget(null);
      await load();
    } finally {
      setReleasing(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        className="w-full rounded-md border border-dashed p-3 text-sm font-medium hover:bg-muted/40 transition-colors"
        onClick={() => setShowAdd(true)}
      >
        + Add property
      </button>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground">No properties yet.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((p) => {
            const isClaimable = p.visibility === "claimable";
            const badge = isClaimable
              ? {
                  label: "Claimable",
                  className: "bg-amber-100 text-amber-800",
                  hint: "Invited homeowner action required",
                }
              : p.review_request_status === "open"
              ? {
                  label: "Additional information required",
                  className: "bg-orange-100 text-orange-900",
                  hint: "Action needed before review can continue",
                }
              : p.review_request_status === "submitted"
              ? {
                  label: "Updates submitted for review",
                  className: "bg-blue-100 text-blue-800",
                  hint: "Our team is reviewing your updates",
                }
              : (STATUS_BADGE[p.status] ?? STATUS_BADGE.unverified);

            return (
              <li key={p.id} className="rounded-md border overflow-hidden">
                <div className="flex gap-3 p-3">
                  {/* Thumbnail — owner hero photo takes priority over vendor enrichment image */}
                  {(p.hero_photo_url || p.cover_image_url) && (
                    <div className="relative h-16 w-24 flex-shrink-0 rounded overflow-hidden bg-muted/40">
                      <Image
                        src={p.hero_photo_url ?? p.cover_image_url!}
                        alt="Property thumbnail"
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 flex-1 min-w-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {p.address_display || p.address_line1}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                      >
                        {badge.icon === "check" && (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                        {badge.label}
                      </span>
                      {!isClaimable &&
                        p.status === "verified" &&
                        p.proposal_interest_status === "interested_after_verification" && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-800 border border-blue-200">
                            Open to Deals
                          </span>
                        )}
                      <span className="text-[11px] text-muted-foreground">
                        {badge.hint}
                      </span>
                    </div>

                    {isClaimable && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        This home was shared with you. Claim it here, then
                        upload verification documents so you can review the
                        offer on the deal page.
                      </div>
                    )}

                    {!isClaimable &&
                      p.proposal_interest_status === "interested_after_verification" && (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {p.visibility_preference === "matched" && "Matched visibility"}
                          {p.visibility_preference === "public" && "Public visibility"}
                          {(p.visibility_preference === "private" || !p.visibility_preference) &&
                            "Private visibility"}
                        </div>
                      )}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {isClaimable ? (
                      <div className="flex flex-col items-end gap-1">
                        <LoadingButton
                          loading={claimingId === p.id}
                          onClick={() => claimNow(p)}
                        >
                          Claim & verify
                        </LoadingButton>
                        <button
                          className="text-xs text-muted-foreground underline"
                          disabled={!!decliningId}
                          onClick={() => {
                            setNotMyPropertyId(p.claim_thread_id ?? null);
                            setNotMyPropertyConfirmOpen(true);
                          }}
                        >
                          Not your property?
                        </button>
                      </div>
                    ) : (
                      <>
                        <Link
                          href={`/properties/${p.id}`}
                          className="text-sm underline"
                        >
                          Details
                        </Link>
                        {canEdit(p.status, p.visibility) && (
                          <button
                            className="text-sm underline"
                            onClick={() => setEditTarget(p)}
                          >
                            Edit
                          </button>
                        )}
                        {canArchive(p.status, p.visibility) && (
                          <button
                            className="text-sm underline"
                            onClick={() => setArchiveId(p.id)}
                          >
                            Archive
                          </button>
                        )}
                        {p.visibility === "owned" &&
                          p.status === "unverified" && (
                            <button
                              className="text-sm underline"
                              onClick={() => setVerifyTarget(p)}
                            >
                              Verify
                            </button>
                          )}
                        {p.visibility === "owned" &&
                          (p.status === "unverified" || p.status === "under_review") && (
                            <button
                              className="text-sm text-muted-foreground underline"
                              onClick={() => setReleaseClaimTarget(p)}
                            >
                              Release claim
                            </button>
                          )}
                      </>
                    )}
                  </div>
                </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showAdd && (
        <PropertyForm
          open={true}
          onClose={() => setShowAdd(false)}
          onSuccess={() => load()}
          context="profile"
        />
      )}

      {editTarget && (
        <PropertyForm
          open={true}
          onClose={() => setEditTarget(null)}
          onSuccess={() => {
            setEditTarget(null);
            load();
          }}
          context="profile"
          editPrefill={{
            propertyId: editTarget.id,
            address_line1: editTarget.address_line1,
            address_line2: editTarget.address_line2 ?? "",
            city: editTarget.city ?? "",
            state: editTarget.state,
            postal_code: editTarget.postal_code,
            ownership_type: editTarget.ownership_type,
            occupancy_use: editTarget.occupancy_use,
            occupancy_use_other: editTarget.occupancy_use_other,
            major_condition_issue: editTarget.major_condition_issue,
            major_condition_issue_details: editTarget.major_condition_issue_details,
            known_liens_and_claims: editTarget.known_liens_and_claims,
            total_known_debt_amount: editTarget.total_known_debt_amount,
            total_known_debt_confidence: editTarget.total_known_debt_confidence,
            debt_statement_availability: editTarget.debt_statement_availability,
            title_claims_known: editTarget.title_claims_known,
            title_claims_details: editTarget.title_claims_details,
            owner_stated_fmv: editTarget.owner_stated_fmv,
            owner_stated_fmv_confidence: editTarget.owner_stated_fmv_confidence,
            owner_stated_fmv_source: editTarget.owner_stated_fmv_source,
            owner_stated_fmv_source_other: editTarget.owner_stated_fmv_source_other,
            willing_to_proceed_formal_review: editTarget.willing_to_proceed_formal_review,
            proposal_interest_status: editTarget.proposal_interest_status,
            visibility_preference: editTarget.visibility_preference,
          }}
        />
      )}

      {verifyTarget && (
        <PropertyForm
          open={true}
          onClose={() => setVerifyTarget(null)}
          onSuccess={() => {
            setVerifyTarget(null);
            load();
          }}
          context="profile"
          editPrefill={{
            propertyId: verifyTarget.id,
            address_line1: verifyTarget.address_line1,
            address_line2: verifyTarget.address_line2 ?? "",
            city: verifyTarget.city ?? "",
            state: verifyTarget.state,
            postal_code: verifyTarget.postal_code,
            ownership_type: verifyTarget.ownership_type,
            occupancy_use: verifyTarget.occupancy_use,
            occupancy_use_other: verifyTarget.occupancy_use_other,
            major_condition_issue: verifyTarget.major_condition_issue,
            major_condition_issue_details: verifyTarget.major_condition_issue_details,
            known_liens_and_claims: verifyTarget.known_liens_and_claims,
            total_known_debt_amount: verifyTarget.total_known_debt_amount,
            total_known_debt_confidence: verifyTarget.total_known_debt_confidence,
            debt_statement_availability: verifyTarget.debt_statement_availability,
            title_claims_known: verifyTarget.title_claims_known,
            title_claims_details: verifyTarget.title_claims_details,
            owner_stated_fmv: verifyTarget.owner_stated_fmv,
            owner_stated_fmv_confidence: verifyTarget.owner_stated_fmv_confidence,
            owner_stated_fmv_source: verifyTarget.owner_stated_fmv_source,
            owner_stated_fmv_source_other: verifyTarget.owner_stated_fmv_source_other,
            willing_to_proceed_formal_review: verifyTarget.willing_to_proceed_formal_review,
            proposal_interest_status: verifyTarget.proposal_interest_status,
            visibility_preference: verifyTarget.visibility_preference,
          }}
        />
      )}

      {archiveId && (
        <Modal
          open={true}
          onClose={() => setArchiveId(null)}
          title="Archive property?"
        >
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              This will mark the property as archived. It cannot be undone.
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => setArchiveId(null)}
              >
                Cancel
              </button>
              <LoadingButton
                loading={archiving}
                onClick={() => archiveId && archiveNow(archiveId)}
              >
                Archive
              </LoadingButton>
            </div>
          </div>
        </Modal>
      )}

      {notMyPropertyConfirmOpen && notMyPropertyId && (
        <Modal
          open={true}
          onClose={() => {
            setNotMyPropertyConfirmOpen(false);
            setNotMyPropertyId(null);
          }}
          title="Confirm: not your property?"
        >
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              This will remove the property from your list. The party who
              shared it with you will be notified. You can still claim the
              property later if that changes.
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => {
                  setNotMyPropertyConfirmOpen(false);
                  setNotMyPropertyId(null);
                }}
              >
                Cancel
              </button>
              <LoadingButton
                loading={!!decliningId}
                onClick={() =>
                  notMyPropertyId && declineOwnership(notMyPropertyId)
                }
              >
                Confirm
              </LoadingButton>
            </div>
          </div>
        </Modal>
      )}

      {releaseClaimTarget && (
        <Modal
          open={true}
          onClose={() => setReleaseClaimTarget(null)}
          title="Release property claim?"
        >
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              This removes your claim on{" "}
              <strong>
                {releaseClaimTarget.address_display ||
                  releaseClaimTarget.address_line1}
              </strong>
              . Any non-binding deal threads associated with this property
              will be closed. This action cannot be undone.
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => setReleaseClaimTarget(null)}
              >
                Cancel
              </button>
              <LoadingButton
                loading={releasing}
                onClick={() =>
                  releaseClaimTarget &&
                  releaseClaimNow(releaseClaimTarget.id)
                }
              >
                Release claim
              </LoadingButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
