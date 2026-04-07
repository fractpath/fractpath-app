const MASHVISOR_BASE_URL =
  process.env.MASHVISOR_BASE_URL || "https://api.mashvisor.com";

const MASHVISOR_API_KEY = process.env.MASHVISOR_API_KEY;

function requireMashvisorConfig() {
  if (!MASHVISOR_API_KEY) {
    throw new Error("Missing MASHVISOR_API_KEY");
  }
}

type MashvisorPropertyLookupInput = {
  address: string;
  city: string;
  state: string;
  zip_code?: string;
};

export async function fetchMashvisorProperty(
  input: MashvisorPropertyLookupInput,
) {
  requireMashvisorConfig();

  const params = new URLSearchParams({
    address: input.address,
    city: input.city,
    state: input.state,
  });

  if (input.zip_code) params.set("zip_code", input.zip_code);

  const url = `${MASHVISOR_BASE_URL}/v1.1/client/property?${params.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "x-api-key": MASHVISOR_API_KEY!,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Mashvisor error ${res.status}: ${text}`);
  }

  return JSON.parse(text);
}
