"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Suggestion = {
  label: string;
  place_id: string;
};

export type ResolvedProperty = {
  property_id: string;
  display_address: string;
  property_status: string | null;
  ownership_status: string | null;
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
        body: JSON.stringify({ place_id: s.place_id, address: s.label }),
      });
      const data = await res.json();
      if (data.ok) {
        onResolved({
          property_id: data.property_id,
          display_address: data.display_address ?? s.label,
          property_status: data.property_status ?? null,
          ownership_status: data.ownership_status ?? null,
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
