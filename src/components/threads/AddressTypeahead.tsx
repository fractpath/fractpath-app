"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Suggestion = {
  label: string;
  place_id: string;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  state_code?: string | null;
  postal_code?: string | null;
};

export type ResolvedProperty = {
  property_id: string;
  display_address: string;
  property_status: string | null;
  ownership_status: string | null;
  normalized_address?: string | null;
  claimed_by_user_id?: string | null;
  property_exists?: boolean | null;
  has_blocking_deal?: boolean | null;
  blocking_reason?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
};

type Props = {
  onResolved: (result: ResolvedProperty) => void;
  initialValue?: string;

  /** Sprint 13 integration controls */
  inputTestId?: string;
  placeholder?: string;
  showLabel?: boolean;
  label?: string;
};

export function AddressTypeahead({
  onResolved,
  initialValue = "",
  inputTestId = "address-typeahead-input",
  placeholder = "Start typing an address...",
  showLabel = true,
  label = "Property Address",
}: Props) {
  const [query, setQuery] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [locked, setLocked] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const lastFetchedRef = useRef<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q === lastFetchedRef.current) return;
    lastFetchedRef.current = q;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(
        `/api/geo/address-autocomplete?q=${encodeURIComponent(q)}`,
        { credentials: "include", signal: controller.signal },
      );
      if (!res.ok) return;
      const data = await res.json();
      if (!controller.signal.aborted) {
        const next = (data.suggestions ?? []) as Suggestion[];
        setSuggestions(next);
        setShowDropdown(next.length > 0);
      }
    } catch {
      // aborted or network error — ignore
    }
  }, []);

  useEffect(() => {
    if (locked || query.length < 4) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(query), 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, locked, fetchSuggestions]);

  async function handleSelect(s: Suggestion) {
    setQuery(s.label);
    setSuggestions([]);
    setShowDropdown(false);
    setLocked(true);
    lastFetchedRef.current = "";
    setResolving(true);

    try {
      const res = await fetch("/api/properties/resolve", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place_id: s.place_id,
          address: s.label,
          structured: {
            address_line1: s.address_line1 ?? null,
            city: s.city ?? null,
            state: s.state_code ?? s.state ?? null,
            postal_code: s.postal_code ?? null,
          },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        onResolved({
          property_id: data.property_id,
          display_address: data.display_address ?? s.label,
          property_status: data.property_status ?? null,
          ownership_status: data.ownership_status ?? null,
          normalized_address: data.normalized_address ?? null,
          claimed_by_user_id: data.claimed_by_user_id ?? null,
          property_exists: data.property_exists ?? null,
          has_blocking_deal: data.has_blocking_deal ?? null,
          blocking_reason: data.blocking_reason ?? null,
          address_line1: data.address_line1 ?? null,
          address_line2: data.address_line2 ?? null,
          city: data.city ?? null,
          state: data.state ?? null,
          postal_code: data.postal_code ?? null,
        });
      }
    } catch {
      // network error — ignore
    } finally {
      setResolving(false);
    }
  }

  function handleInputChange(value: string) {
    setQuery(value);
    if (locked) {
      setLocked(false);
      lastFetchedRef.current = "";
    }
  }

  return (
    <div className="relative">
      {showLabel ? (
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {label}
        </label>
      ) : null}

      <input
        type="text"
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        data-testid={inputTestId}
      />

      {resolving ? (
        <p className="mt-1 text-xs text-gray-500">Resolving property...</p>
      ) : null}

      {showDropdown && suggestions.length > 0 ? (
        <ul
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg"
          data-testid="address-suggestions"
        >
          {suggestions.map((s) => (
            <li key={s.place_id}>
              <button
                type="button"
                onClick={() => handleSelect(s)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
