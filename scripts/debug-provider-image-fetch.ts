/**
 * Debug script: probe a provider image URL the same way importSingleImage() does.
 *
 *   pnpm tsx scripts/debug-provider-image-fetch.ts "<url>"
 *
 * Exits 1 if any fetch attempt throws or returns a non-OK status.
 */

import { inspect } from "util";

async function attempt(
  label: string,
  fetchUrl: string,
  options: RequestInit,
): Promise<boolean> {
  console.log(`\n${"─".repeat(72)}`);
  console.log(`Attempt : ${label}`);
  console.log(`Headers :`, (options.headers as Record<string, string> | undefined) ?? {});
  console.log(`─`.repeat(72));

  let res: Response;
  try {
    res = await fetch(fetchUrl, options);
  } catch (err) {
    const e = err as Error & { cause?: { code?: string; message?: string } };
    console.log("THREW   : YES");
    console.log("name    :", e?.name    ?? "(none)");
    console.log("message :", e?.message ?? "(none)");
    console.log("cause   :", e?.cause ?? "(none)");
    console.log("cause.code   :", (e?.cause as { code?: string } | undefined)?.code    ?? "(none)");
    console.log("cause.message:", (e?.cause as { message?: string } | undefined)?.message ?? "(none)");
    console.log("inspect :", inspect(err, { depth: 5 }));
    return false;
  }

  console.log("THREW   : NO");
  console.log("status  :", res.status, res.statusText);
  console.log("finalUrl:", res.url);
  console.log("content-type  :", res.headers.get("content-type")  ?? "(none)");
  console.log("content-length:", res.headers.get("content-length") ?? "(none)");

  if (!res.ok) {
    console.log("RESULT  : FAIL (non-OK status)");
    try { await res.arrayBuffer(); } catch { /* drain */ }
    return false;
  }

  console.log("RESULT  : OK");
  try { await res.arrayBuffer(); } catch { /* drain */ }
  return true;
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: pnpm tsx scripts/debug-provider-image-fetch.ts <url>");
    process.exit(2);
  }

  let hostname = "(unknown)";
  try { hostname = new URL(url).hostname; } catch { /* noop */ }

  console.log("=".repeat(72));
  console.log("URL     :", url);
  console.log("Host    :", hostname);
  console.log("=".repeat(72));

  let anyFailed = false;

  // ─── Attempt 1: production headers ────────────────────────────────────────────
  const ok1 = await attempt(
    "Production headers (User-Agent: FractPath-Enrichment/1.0)",
    url,
    {
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
      headers: {
        "User-Agent": "FractPath-Enrichment/1.0",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    },
  );
  if (!ok1) anyFailed = true;

  // ─── Attempt 2: no custom headers (baseline comparison) ───────────────────────
  const ok2 = await attempt(
    "No custom headers (baseline comparison — not used in production)",
    url,
    {
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!ok2) anyFailed = true;

  // ─── Summary ──────────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(72)}`);
  console.log("Summary");
  console.log("  Attempt 1 (production headers) :", ok1 ? "OK" : "FAILED");
  console.log("  Attempt 2 (no custom headers)  :", ok2 ? "OK" : "FAILED");
  console.log("=".repeat(72));

  process.exit(anyFailed ? 1 : 0);
}

main();
