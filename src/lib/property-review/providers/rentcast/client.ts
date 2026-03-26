import type {
  RentcastAvmResponse,
  RentcastPropertyResponse,
} from "./types";

function getRentcastConfig() {
  const apiKey = process.env.RENTCAST_API_KEY;
  const baseUrl = process.env.RENTCAST_BASE_URL || "https://api.rentcast.io/v1";

  if (!apiKey) {
    throw new Error("Missing RENTCAST_API_KEY");
  }

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
  };
}

async function rentcastFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const { apiKey, baseUrl } = getRentcastConfig();

  const url = new URL(`${baseUrl}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value && value.trim().length > 0) {
      url.searchParams.set(key, value);
    }
  });

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      accept: "application/json",
      "X-Api-Key": apiKey,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`RentCast request failed (${res.status}): ${body || res.statusText}`);
  }

  return res.json() as Promise<T>;
}

// Exact-address-first subject resolver.
// Sends the full canonical address as a single `address` string, which RentCast
// treats as an exact property lookup rather than a component-based area search.
// Returns 0 or 1 records for a specific subject property.
export async function fetchRentcastPropertyRecordExact(input: {
  addressLine1: string;
  city: string;
  state: string;
  zipCode?: string | null;
}): Promise<RentcastPropertyResponse> {
  const address = [
    input.addressLine1.trim(),
    input.city.trim(),
    [input.state.trim(), (input.zipCode ?? "").trim()].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return rentcastFetch<RentcastPropertyResponse>("/properties", { address });
}

// Component-based search. Can return multiple nearby records and is used only
// as a fallback to surface admin-review candidates when exact resolution fails.
export async function fetchRentcastPropertyRecord(input: {
  addressLine1: string;
  city: string;
  state: string;
  zipCode?: string | null;
}): Promise<RentcastPropertyResponse> {
  return rentcastFetch<RentcastPropertyResponse>("/properties", {
    addressLine1: input.addressLine1,
    city: input.city,
    state: input.state,
    zipCode: input.zipCode ?? "",
  });
}

export async function fetchRentcastAvm(input: {
  addressLine1: string;
  city: string;
  state: string;
  zipCode?: string | null;
}): Promise<RentcastAvmResponse> {
  return rentcastFetch<RentcastAvmResponse>("/avm/value", {
    addressLine1: input.addressLine1,
    city: input.city,
    state: input.state,
    zipCode: input.zipCode ?? "",
  });
}