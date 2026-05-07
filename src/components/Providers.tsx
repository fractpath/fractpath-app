"use client";

import { ToastProvider } from "@/components/ui/Toast";
import { PageLoadingProvider } from "@/components/ui/PageLoadingOverlay";
import { PostHogProvider } from "@/components/analytics/PostHogProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProvider>
      <ToastProvider>
        <PageLoadingProvider>{children}</PageLoadingProvider>
      </ToastProvider>
    </PostHogProvider>
  );
}
