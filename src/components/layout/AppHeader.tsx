import Link from "next/link";

export function AppHeader() {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
        <Link
          href="/dashboard"
          className="text-lg font-semibold tracking-tight"
        >
          FractPath
        </Link>

        <nav className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Dashboard
          </Link>
          <Link
            href="/deal/new"
            className="inline-flex items-center rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
          >
            Create Deal
          </Link>
          <Link
            href="/me"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Profile
          </Link>
          <form method="post" action="/auth/logout" className="m-0">
            <button
              type="submit"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
