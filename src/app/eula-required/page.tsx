import Link from "next/link";

export default function EulaRequiredPage() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold">EULA required</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        To use FractPath, you need to accept the End User License Agreement. If
        you declined, access is blocked until you accept.
      </p>

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
