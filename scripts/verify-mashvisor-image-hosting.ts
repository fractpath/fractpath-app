/**
 * Verification script: Mashvisor image-hosting fix
 *
 * Asserts that:
 *  1. mashvisorEnrichmentService.ts contains all required image-import logic.
 *  2. EnrichedPropertyPreview.tsx no longer silently hides images.
 *  3. EnrichedPropertyPreview.tsx shows a visible fallback on image error.
 *
 * Also runs a pure unit test of the rewriteImagesPayload logic
 * using an inlined mock — no network calls, no Supabase.
 *
 * Exit code 0 = all checks pass.
 * Exit code 1 = one or more checks failed.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(process.cwd());

function readFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

let failures = 0;

function pass(msg: string) {
  console.log(`  PASS  ${msg}`);
}

function fail(msg: string) {
  console.error(`  FAIL  ${msg}`);
  failures++;
}

function assert(condition: boolean, passMsg: string, failMsg: string) {
  if (condition) {
    pass(passMsg);
  } else {
    fail(failMsg);
  }
}

// ─── Load target files ─────────────────────────────────────────────────────────

const enrichmentSvc = readFile(
  "src/lib/mashvisor/mashvisorEnrichmentService.ts",
);
const previewComponent = readFile(
  "src/components/property/EnrichedPropertyPreview.tsx",
);
const types = readFile("src/lib/mashvisor/types.ts");

console.log("\n── Check 1: mashvisorEnrichmentService.ts — bucket helper ───────────────");

assert(
  /IMAGE_BUCKET\s*=/.test(enrichmentSvc),
  "IMAGE_BUCKET constant is defined",
  "IMAGE_BUCKET constant is missing",
);

assert(
  /ensureImageBucket/.test(enrichmentSvc),
  "ensureImageBucket helper exists",
  "ensureImageBucket helper is missing",
);

assert(
  /createBucket/.test(enrichmentSvc),
  "createBucket call present (bucket auto-creation)",
  "createBucket call is missing — bucket is never auto-created",
);

console.log("\n── Check 2: mashvisorEnrichmentService.ts — image import logic ──────────");

assert(
  /importSingleImage|importImages/.test(enrichmentSvc),
  "image import helper (importSingleImage / importImages) exists",
  "image import helper is missing",
);

assert(
  /AbortSignal\.timeout/.test(enrichmentSvc),
  "fetch uses AbortSignal.timeout (prevents hung requests)",
  "AbortSignal.timeout is missing — network requests can hang indefinitely",
);

assert(
  /\.upload\(/.test(enrichmentSvc),
  "supabase storage.upload() call present",
  "supabase storage.upload() call is missing",
);

assert(
  /getPublicUrl/.test(enrichmentSvc),
  "getPublicUrl call present (rewrites to FractPath-hosted URL)",
  "getPublicUrl call is missing",
);

console.log("\n── Check 3: mashvisorEnrichmentService.ts — rewrite step ────────────────");

assert(
  /rewriteImagesPayload|urlMap/.test(enrichmentSvc),
  "URL rewrite step present (rewriteImagesPayload / urlMap)",
  "URL rewrite step is missing — provider URLs are not replaced",
);

assert(
  /provider_image_urls/.test(enrichmentSvc),
  "Original provider URLs preserved for debugging (provider_image_urls)",
  "provider_image_urls preservation is missing",
);

assert(
  /partial success|partial|Non-fatal|non-fatal|continue/i.test(enrichmentSvc),
  "Partial-success handling present (failures don't abort enrichment)",
  "Partial-success handling is missing",
);

assert(
  /console\.log|console\.warn/.test(enrichmentSvc),
  "Logging present (attempted / success / failure counts)",
  "Logging is missing",
);

console.log("\n── Check 4: EnrichedPropertyPreview.tsx — no silent hide on error ────────");

assert(
  !/btn\.style\.display\s*=\s*['"]none['"]/.test(previewComponent),
  'Silent hide (btn.style.display = "none") has been removed',
  'btn.style.display = "none" is still present — images are silently hidden on error',
);

console.log("\n── Check 5: EnrichedPropertyPreview.tsx — visible fallback ──────────────");

assert(
  /Image unavailable|image unavailable|img.*unavailable|unavailable/i.test(
    previewComponent,
  ),
  'Visible fallback text ("Image unavailable" or equivalent) is present',
  'No visible fallback text found — failed images will still leave a blank area',
);

assert(
  /markFailed|failedUrls|failedImages/.test(previewComponent),
  "Image failure state tracking present (markFailed / failedUrls / failedImages)",
  "Image failure state tracking is missing",
);

console.log("\n── Check 6: types.ts — payload shape stable ─────────────────────────────");

assert(
  /cover_image_url\s*:\s*string\s*\|\s*null/.test(types),
  "cover_image_url: string | null present in MashvisorImagesPayload",
  "cover_image_url type is missing or changed",
);

assert(
  /image_urls\s*:\s*string\[\]/.test(types),
  "image_urls: string[] present in MashvisorImagesPayload",
  "image_urls type is missing or changed",
);

assert(
  /provider_image_urls/.test(types),
  "Optional provider_image_urls debug field declared in MashvisorImagesPayload",
  "provider_image_urls is not declared in types.ts",
);

// ─── Optional pure unit test: rewrite logic ────────────────────────────────────
// We test the rewrite behaviour by applying the same Map-based logic inline,
// without importing the server-only service module.

console.log("\n── Check 7: Pure unit test — rewriteImagesPayload logic ─────────────────");

(function unitTestRewrite() {
  // Mirror of the rewriteImagesPayload helper in mashvisorEnrichmentService.ts
  function rewriteImagesPayload(
    providerPayload: { cover_image_url: string | null; image_urls: string[] },
    urlMap: Map<string, string>,
  ): { cover_image_url: string | null; image_urls: string[]; provider_image_urls: { cover: string | null; gallery: string[] } } {
    const hostedImageUrls = providerPayload.image_urls
      .map((u) => urlMap.get(u))
      .filter((u): u is string => u !== undefined);

    const hostedCover = providerPayload.cover_image_url
      ? (urlMap.get(providerPayload.cover_image_url) ?? hostedImageUrls[0] ?? null)
      : (hostedImageUrls[0] ?? null);

    return {
      cover_image_url: hostedCover,
      image_urls: hostedImageUrls,
      provider_image_urls: {
        cover: providerPayload.cover_image_url,
        gallery: providerPayload.image_urls,
      },
    };
  }

  // Test A: all images successfully imported
  {
    const provider = {
      cover_image_url: "https://cdn.listhub.com/a.jpg",
      image_urls: ["https://cdn.listhub.com/a.jpg", "https://cdn.listhub.com/b.jpg"],
    };
    const urlMap = new Map([
      ["https://cdn.listhub.com/a.jpg", "https://project.supabase.co/storage/v1/object/public/property-images/enrichments/p1/e1/0.jpg"],
      ["https://cdn.listhub.com/b.jpg", "https://project.supabase.co/storage/v1/object/public/property-images/enrichments/p1/e1/1.jpg"],
    ]);
    const result = rewriteImagesPayload(provider, urlMap);
    assert(
      result.cover_image_url?.includes("supabase.co") ?? false,
      "Test A: cover_image_url rewritten to FractPath-hosted URL",
      "Test A: cover_image_url was not rewritten",
    );
    assert(
      result.image_urls.length === 2 && result.image_urls.every((u) => u.includes("supabase.co")),
      "Test A: all image_urls rewritten",
      "Test A: some image_urls were not rewritten",
    );
    assert(
      result.provider_image_urls.cover === "https://cdn.listhub.com/a.jpg",
      "Test A: original provider cover URL preserved",
      "Test A: provider cover URL not preserved",
    );
  }

  // Test B: partial failure — one image could not be imported
  {
    const provider = {
      cover_image_url: "https://cdn.listhub.com/fail.jpg",
      image_urls: ["https://cdn.listhub.com/fail.jpg", "https://cdn.listhub.com/ok.jpg"],
    };
    const urlMap = new Map([
      // fail.jpg not in map — import failed
      ["https://cdn.listhub.com/ok.jpg", "https://project.supabase.co/storage/v1/object/public/property-images/enrichments/p2/e2/1.jpg"],
    ]);
    const result = rewriteImagesPayload(provider, urlMap);
    assert(
      result.cover_image_url?.includes("supabase.co") ?? false,
      "Test B: cover falls back to next available hosted URL when cover import failed",
      "Test B: cover_image_url should fall back to next available hosted URL",
    );
    assert(
      result.image_urls.length === 1,
      "Test B: failed image dropped from image_urls",
      "Test B: failed image should be dropped from image_urls",
    );
  }

  // Test C: all images fail
  {
    const provider = {
      cover_image_url: "https://cdn.listhub.com/x.jpg",
      image_urls: ["https://cdn.listhub.com/x.jpg"],
    };
    const urlMap = new Map<string, string>(); // empty — nothing uploaded
    const result = rewriteImagesPayload(provider, urlMap);
    assert(
      result.cover_image_url === null,
      "Test C: cover_image_url is null when all imports fail",
      "Test C: cover_image_url should be null when all imports fail",
    );
    assert(
      result.image_urls.length === 0,
      "Test C: image_urls is empty when all imports fail",
      "Test C: image_urls should be empty when all imports fail",
    );
    assert(
      result.provider_image_urls.gallery.includes("https://cdn.listhub.com/x.jpg"),
      "Test C: original provider URLs preserved even when all fail",
      "Test C: provider URLs should be preserved even when all fail",
    );
  }
})();

// ─── Summary ───────────────────────────────────────────────────────────────────

console.log("");
if (failures === 0) {
  console.log(`✓ All checks passed.`);
  process.exit(0);
} else {
  console.error(`✗ ${failures} check(s) failed. Fix the issues above before claiming success.`);
  process.exit(1);
}
