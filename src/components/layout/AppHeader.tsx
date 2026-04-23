import Link from "next/link";
import Image from "next/image";

export function AppHeader() {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image
            src="/brand/FractPath_Logo_Black.png"
            alt="FractPath"
            width={120}
            height={28}
            priority
          />
        </Link>

        <nav className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Dashboard
          </Link>
          <Link
            href="/verified-properties"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Opportunities
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
