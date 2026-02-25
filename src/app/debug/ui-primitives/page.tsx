"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { useToast } from "@/components/ui/Toast";

export default function UiPrimitivesDemo() {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [loadingBtn, setLoadingBtn] = useState(false);

  function handleModalPrimary() {
    setModalLoading(true);
    setTimeout(() => {
      setModalLoading(false);
      setModalOpen(false);
      toast.success("Changes saved successfully.");
    }, 1500);
  }

  function handleLoadingBtn() {
    setLoadingBtn(true);
    setTimeout(() => {
      setLoadingBtn(false);
      toast.success("Action completed.");
    }, 2000);
  }

  return (
    <main className="mx-auto max-w-xl p-8 space-y-8">
      <h1 className="text-2xl font-semibold">UI Primitives Demo</h1>
      <p className="text-sm text-muted-foreground">
        Internal reference page for reusable components.
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Modal</h2>
        <LoadingButton onClick={() => setModalOpen(true)}>
          Open Modal
        </LoadingButton>

        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Confirm your changes"
          description="This will update your deal terms. You can review the changes before they take effect."
          primaryLabel="Save changes"
          primaryLoading={modalLoading}
          onPrimary={handleModalPrimary}
          secondaryLabel="Cancel"
        >
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            Sample modal content area. Forms and data capture go here.
          </div>
        </Modal>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Loading Button</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <LoadingButton
            variant="primary"
            loading={loadingBtn}
            onClick={handleLoadingBtn}
          >
            Submit
          </LoadingButton>
          <LoadingButton variant="outline" onClick={() => {}}>
            Cancel
          </LoadingButton>
          <LoadingButton variant="ghost" onClick={() => {}}>
            Skip
          </LoadingButton>
          <LoadingButton variant="primary" disabled>
            Disabled
          </LoadingButton>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Toast Notifications</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <LoadingButton
            variant="primary"
            onClick={() => toast.success("Your scenario has been saved.")}
          >
            Success Toast
          </LoadingButton>
          <LoadingButton
            variant="outline"
            onClick={() =>
              toast.error(
                "Unable to save changes. Please check your connection and try again.",
              )
            }
          >
            Error Toast
          </LoadingButton>
        </div>
      </section>
    </main>
  );
}
