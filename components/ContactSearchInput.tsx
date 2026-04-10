"use client";

import { useEffect, useRef, useState } from "react";

type ContactResult = {
  name: string;
  email: string;
  organization: string | null;
};

type Props = {
  onSelect: (contact: { name: string; email: string }) => void;
  placeholder?: string;
  label?: string;
};

export default function ContactSearchInput({
  onSelect,
  placeholder = "이름 또는 이메일로 검색",
  label = "참가자 검색",
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [empty, setEmpty] = useState(false);
  const [open, setOpen] = useState(false);
  const blurTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setResults([]);
      setError("");
      setEmpty(false);
      setOpen(false);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      setEmpty(false);

      try {
        const response = await fetch(
          `/api/contacts/search?query=${encodeURIComponent(trimmedQuery)}`
        );
        const result = (await response.json()) as {
          error?: string;
          results?: ContactResult[];
        };

        if (!response.ok) {
          throw new Error(result.error || "연락처 검색에 실패했어요.");
        }

        const nextResults = (result.results || []).filter(
          (candidate, index, array) =>
            array.findIndex(
              (item) => item.email.toLowerCase() === candidate.email.toLowerCase()
            ) === index
        );

        setResults(nextResults);
        setEmpty(nextResults.length === 0);
        setOpen(true);
      } catch (searchError) {
        console.error(searchError);
        setResults([]);
        setEmpty(false);
        setOpen(true);
        setError(
          searchError instanceof Error
            ? searchError.message
            : "연락처 검색 중 오류가 발생했어요."
        );
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  function handleSelect(contact: ContactResult) {
    onSelect({ name: contact.name, email: contact.email });
    setQuery("");
    setResults([]);
    setError("");
    setEmpty(false);
    setOpen(false);
  }

  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <label className="mb-1 block text-xs font-medium text-gray-600">
        {label}
      </label>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
          }
        }}
        onFocus={() => {
          if (query.trim()) setOpen(true);
        }}
        onBlur={() => {
          blurTimeoutRef.current = window.setTimeout(() => {
            setOpen(false);
          }, 120);
        }}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
      />

      {loading && <p className="mt-2 text-xs text-gray-500">검색 중...</p>}
      {error && open && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {empty && !error && open && (
        <p className="mt-2 text-xs text-gray-500">검색 결과가 없습니다.</p>
      )}

      {open && results.length > 0 && (
        <div className="mt-3 space-y-2">
          {results.map((candidate) => (
            <button
              key={candidate.email}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                if (blurTimeoutRef.current !== null) {
                  window.clearTimeout(blurTimeoutRef.current);
                }
                handleSelect(candidate);
              }}
              className="block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-left hover:bg-gray-100"
            >
              <p className="text-sm font-medium text-gray-900">{candidate.name}</p>
              <p className="text-xs text-gray-600">{candidate.email}</p>
              {candidate.organization && (
                <p className="text-xs text-gray-500">{candidate.organization}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
