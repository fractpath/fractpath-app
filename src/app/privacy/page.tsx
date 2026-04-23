import { PRIVACY_POLICY_TEXT, POLICY_EFFECTIVE_DATE, POLICY_VERSION } from "@/lib/policies/content";
import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — FractPath",
  description: `FractPath Privacy Policy Version ${POLICY_VERSION}, effective ${POLICY_EFFECTIVE_DATE}.`,
};

export default function PrivacyPolicyPage() {
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
        <h1 className="text-2xl font-semibold">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">
          Version {POLICY_VERSION} &mdash; Effective {POLICY_EFFECTIVE_DATE}
        </p>
      </div>

      <div className="rounded-lg border bg-muted/20 p-6">
        <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed text-foreground">
          {PRIVACY_POLICY_TEXT}
        </pre>
      </div>

      <div className="mt-8 text-sm text-muted-foreground">
        <Link href="/terms" className="underline hover:text-foreground">
          Terms of Use
        </Link>
      </div>
    </main>
  );
}
