/**
 * Shared types and helpers for owner property photos.
 */

export type OwnerPhoto = {
  id: string;
  property_id: string;
  uploaded_by: string;
  storage_path: string;
  storage_bucket: string;
  public_url: string;
  sort_order: number;
  is_hero: boolean;
  caption: string | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PropertyFactCorrection = {
  id: string;
  property_id: string;
  submitted_by: string;
  field_key: string;
  display_label: string;
  canonical_value: string | null;
  owner_submitted_value: string;
  review_status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_note: string | null;
  created_at: string;
  updated_at: string;
};

export const PHOTO_BUCKET = "property-photos";

/** Build the public storage URL for an owner photo path. */
export function photoPublicUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${PHOTO_BUCKET}/${storagePath}`;
}

/**
 * Derive the effective hero URL from owner photos.
 * Priority: is_hero photo → first active photo → null (fall through to vendor / map)
 */
export function heroPhotoUrl(photos: OwnerPhoto[]): string | null {
  const active = photos.filter((p) => !p.removed_at);
  if (active.length === 0) return null;
  const hero = active.find((p) => p.is_hero);
  return hero?.public_url ?? active[0].public_url;
}

/**
 * All active owner photos sorted by sort_order.
 */
export function activePhotos(photos: OwnerPhoto[]): OwnerPhoto[] {
  return photos
    .filter((p) => !p.removed_at)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** Correctable property fact fields. */
export const CORRECTABLE_FIELDS: {
  key: string;
  label: string;
  unit?: string;
}[] = [
  { key: "bedrooms", label: "Bedrooms" },
  { key: "bathrooms", label: "Bathrooms" },
  { key: "sqft_living", label: "Living area (sq ft)", unit: "sq ft" },
  { key: "lot_sqft", label: "Lot size (sq ft)", unit: "sq ft" },
  { key: "year_built", label: "Year built" },
  { key: "owner_occupied", label: "Owner occupied" },
];
