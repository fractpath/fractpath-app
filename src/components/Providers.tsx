"use client";

import { ToastProvider } from "@/components/ui/Toast";
import { PageLoadingProvider } from "@/components/ui/PageLoadingOverlay";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <PageLoadingProvider>{children}</PageLoadingProvider>
    </ToastProvider>
  );
}
