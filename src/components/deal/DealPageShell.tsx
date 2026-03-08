"use client";

import { useState } from "react";
import { DealHeader } from "@/components/deals/DealHeader";
import { DealActionsBar } from "@/components/deal/DealActionsBar";

type ActiveThread = {
  id: string;
  status: string;
  buyer_user_id?: string;
};

type HeaderProperty = {
  property_id: string;
  display_address: string;
  property_status?: string | null;
  ownership_status?: string | null;
};

type AnyRecord = Record<string, unknown>;

type Props = {
  dealId: string;
  isOwner: boolean;
  locked: boolean;
  activeThread: ActiveThread | null;
  initialTitle: string | null;
  initialProperty: HeaderProperty | null;
  effectiveSnapshot: AnyRecord | null;
};

export function DealPageShell({
  dealId,
  isOwner,
  locked,
  activeThread,
  initialTitle,
  initialProperty,
  effectiveSnapshot,
}: Props) {
  const [propertyId, setPropertyId] = useState<string | null>(
    initialProperty?.property_id ?? null,
  );

  return (
    <>
      <div className="flex justify-end">
        <DealActionsBar
          dealId={dealId}
          propertyId={propertyId}
          locked={locked}
          readOnly={!isOwner}
          effectiveSnapshot={effectiveSnapshot}
        />
      </div>

      <DealHeader
        dealId={dealId}
        readOnly={!isOwner}
        activeThread={activeThread}
        initialTitle={initialTitle}
        initialProperty={initialProperty}
        locked={locked}
        onPropertyChange={setPropertyId}
      />
    </>
  );
}
