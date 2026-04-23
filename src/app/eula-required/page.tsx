import Link from "next/link";
import { POLICY_EFFECTIVE_DATE, POLICY_VERSION } from "@/lib/policies/content";

export default function EulaRequiredPage() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold">Agreement declined</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Access to FractPath requires acceptance of the Privacy Policy and Terms
        of Use (Version {POLICY_VERSION}, effective {POLICY_EFFECTIVE_DATE}). If
        you declined and would like to reconsider, sign in again to review and
        accept.
      </p>

      <div className="mt-4 flex gap-4 text-sm">
        <Link href="/privacy" className="underline hover:text-foreground">
          Privacy Policy
        </Link>
        <Link href="/terms" className="underline hover:text-foreground">
          Terms of Use
        </Link>
      </div>

      <div className="mt-6 flex gap-3">
        <Link
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
          href="/login"
        >
          Back to login
        </Link>

        <form action="/auth/logout" method="post">
          <button
            className="rounded-md border px-4 py-2 text-sm font-medium"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
