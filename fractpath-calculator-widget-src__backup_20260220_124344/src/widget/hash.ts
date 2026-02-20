function sortedJsonString(obj: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const val = obj[key];
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      sorted[key] = sortedJsonString(val as Record<string, unknown>);
    } else {
      sorted[key] = val;
    }
  }
  return JSON.stringify(sorted);
}

export async function deterministicHash(obj: Record<string, unknown>): Promise<string> {
  const str = sortedJsonString(obj);
  const data = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}
