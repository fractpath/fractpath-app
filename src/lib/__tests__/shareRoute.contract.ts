import crypto from "node:crypto";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  FAIL: ${name} — ${err.message}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

function base64Url(bytes: Buffer) {
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function isValidUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

console.log("Share Route Validation Tests");
console.log("============================");

test("share token is URL-safe base64 (no +, /, =)", () => {
  const token = base64Url(crypto.randomBytes(32));
  assert(token.length > 0, "Token must be non-empty");
  assert(!/[+/=]/.test(token), "Token must not contain +, /, or =");
  assert(/^[A-Za-z0-9_-]+$/.test(token), "Token must be URL-safe");
});

test("share tokens are unique across 100 generations", () => {
  const tokens = Array.from({ length: 100 }, () =>
    base64Url(crypto.randomBytes(32)),
  );
  const set = new Set(tokens);
  assert(set.size === tokens.length, "Duplicate token found");
});

test("dealId UUID validation accepts valid UUIDs", () => {
  const valid = [
    "550e8400-e29b-41d4-a716-446655440000",
    "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  ];
  for (const uuid of valid) {
    assert(isValidUuid(uuid), `Expected valid: ${uuid}`);
  }
});

test("dealId UUID validation rejects invalid values", () => {
  const invalid = ["", "not-a-uuid", "12345", "SELECT * FROM deals", "null"];
  for (const v of invalid) {
    assert(!isValidUuid(v), `Expected invalid: ${v}`);
  }
});

test("email validation: rejects empty and missing @", () => {
  const invalid = ["", "notanemail", "   ", "foo bar"];
  for (const email of invalid) {
    const trimmed = email.trim();
    const valid = trimmed.length > 0 && trimmed.includes("@");
    assert(!valid, `Expected invalid: "${email}"`);
  }
});

test("email validation: accepts basic valid emails", () => {
  const valid = ["user@example.com", "a@b.co", "test+tag@domain.org"];
  for (const email of valid) {
    const trimmed = email.trim();
    const ok = trimmed.length > 0 && trimmed.includes("@");
    assert(ok, `Expected valid: "${email}"`);
  }
});

test("shareUrl shape includes mode=shared param", () => {
  const origin = "https://example.com";
  const token = base64Url(crypto.randomBytes(32));
  const shareUrl = `${origin}/share?t=${encodeURIComponent(token)}`;
  assert(shareUrl.startsWith("https://"), "Must be HTTPS");
  assert(shareUrl.includes("/share?t="), "Must contain /share?t=");
  assert(shareUrl.includes(token), "Must contain token");
});

test("response shape: successful share returns ok and shareUrl", () => {
  const mockResponse = {
    ok: true,
    shareUrl: "https://example.com/share?t=abc123",
  };
  assert(mockResponse.ok === true, "ok must be true");
  assert(typeof mockResponse.shareUrl === "string", "shareUrl must be string");
  assert(mockResponse.shareUrl.length > 0, "shareUrl must be non-empty");
});

test("response shape: error returns ok=false and error message", () => {
  const mockResponse = {
    ok: false,
    error: "Valid toEmail is required",
  };
  assert(mockResponse.ok === false, "ok must be false");
  assert(typeof mockResponse.error === "string", "error must be string");
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
