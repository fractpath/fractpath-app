import { TERMS_OF_USE_TEXT, POLICY_EFFECTIVE_DATE, POLICY_VERSION } from "@/lib/policies/content";
import Link from "next/link";

export const metadata = {
  title: "Terms of Use — FractPath",
  description: `FractPath Terms of Use Version ${POLICY_VERSION}, effective ${POLICY_EFFECTIVE_DATE}.`,
};

export default function TermsOfUsePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to home
        </Link>
      </div>

      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold">Terms of Use</h1>
        <p className="text-sm text-muted-foreground">
          Version {POLICY_VERSION} &mdash; Effective {POLICY_EFFECTIVE_DATE}
        </p>
      </div>

      <div className="rounded-lg border bg-muted/20 p-6">
        <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed text-foreground">
          {TERMS_OF_USE_TEXT}
        </pre>
      </div>

      <div className="mt-8 text-sm text-muted-foreground">
        <Link href="/privacy" className="underline hover:text-foreground">
          Privacy Policy
        </Link>
      </div>
    </main>
  );
}
