import { AppHeader } from "@/components/layout/AppHeader";
import { PropertyMap } from "@/components/map/PropertyMap";
import Link from "next/link";

export const runtime = "nodejs";

export const metadata = {
  title: "Property Map | FractPath",
  description: "Explore verified properties on the map.",
};

export default function MapPage() {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

  if (!token) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-3xl p-6">
          <p className="text-sm text-destructive">Map is unavailable: missing map configuration.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <div className="border-b bg-background px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold leading-none">Property Map</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Verified properties open to proposals
          </p>
        </div>
        <Link
          href="/verified-properties"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          View as list
        </Link>
      </div>
      <PropertyMap token={token} />
    </div>
  );
}
