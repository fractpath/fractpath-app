import Link from "next/link";

export function AppHeader() {
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
        FractPath
      </Link>

      <nav className="flex items-center gap-4">
        <Link href="/me" className="text-sm hover:underline">
          Profile
        </Link>
        <Link
          href="/deal/new"
          className="inline-flex items-center rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
        >
          Create deal
        </Link>
        <form method="post" action="/auth/logout" className="m-0">
          <button
            type="submit"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50"
          >
            Sign out
          </button>
        </form>
      </nav>
    </header>
  );
}
