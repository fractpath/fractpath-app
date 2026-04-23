"use client";

import { useState } from "react";
import { PropertyHeroMedia } from "@/components/property/PropertyHeroMedia";
import { ManagePhotosModal } from "@/components/property/ManagePhotosModal";
import type { OwnerPhoto } from "@/lib/property/photos";
import type { MashvisorImagesPayload } from "@/lib/mashvisor/types";

type Props = {
  propertyId: string;
  initialPhotos: OwnerPhoto[];
  images: MashvisorImagesPayload | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  audience: "owner" | "buyer" | "admin";
  canManagePhotos: boolean;
};

/**
 * Client wrapper that combines PropertyHeroMedia + ManagePhotosModal.
 * Used by owner and admin pages.  Public page uses PropertyHeroMedia directly.
 */
export function PropertyMediaSection({
  propertyId,
  initialPhotos,
  images,
  lat,
  lng,
  address,
  audience,
  canManagePhotos,
}: Props) {
  const [photos, setPhotos] = useState<OwnerPhoto[]>(initialPhotos);
  const [manageOpen, setManageOpen] = useState(false);

  return (
    <>
      <PropertyHeroMedia
        ownerPhotos={photos}
        images={images}
        lat={lat}
        lng={lng}
        address={address}
        audience={audience}
        onManagePhotos={canManagePhotos ? () => setManageOpen(true) : undefined}
      />

      {canManagePhotos && manageOpen && (
        <ManagePhotosModal
          propertyId={propertyId}
          initialPhotos={photos}
          onClose={() => setManageOpen(false)}
          onPhotosChange={setPhotos}
        />
      )}
    </>
  );
}
