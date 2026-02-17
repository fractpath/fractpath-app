export function getAppBaseUrlServer(): string {
  const raw =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    "https://app.fractpath.com";

  return String(raw).replace(/\/+$/, "");
}
