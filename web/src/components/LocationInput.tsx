'use client';

import { useEffect, useRef, useState } from 'react';
import { searchLocalCities } from '@/lib/us-cities';

type Suggestion = { label: string; lat: number; lng: number };

type Props = {
  name: string;
  defaultValues?: string[];
};

export function LocationInput({ name, defaultValues = [] }: Props) {
  const [selected, setSelected] = useState<string[]>(defaultValues);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelected(defaultValues);
    setQuery('');
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  }, [defaultValues.join('|')]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }

    const local = searchLocalCities(query, 8).map((city) => ({
      label: city.label,
      lat: city.lat,
      lng: city.lng,
    }));
    setSuggestions(local);
    setActiveIndex(local.length ? 0 : -1);

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        const data = (await res.json()) as Suggestion[];
        if (data.length) {
          setSuggestions(data);
          setActiveIndex(0);
        }
      } catch {
        // keep local suggestions
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, open]);

  function addLocation(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    setSelected((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setQuery('');
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function removeLocation(label: string) {
    setSelected((prev) => prev.filter((l) => l !== label));
  }

  function handleFocus() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setOpen(true);
  }

  function handleBlur() {
    blurTimer.current = setTimeout(() => {
      setOpen(false);
      setActiveIndex(-1);
    }, 200);
  }

  function pickSuggestion(index: number) {
    const suggestion = suggestions[index];
    if (suggestion) addLocation(suggestion.label);
  }

  const trimmed = query.trim();
  const showDropdown = open && trimmed.length >= 2;
  const showManualAdd = showDropdown && !loading && suggestions.length === 0;

  return (
    <div className="space-y-2">
      {selected.map((loc) => (
        <div key={loc} className="flex items-center gap-2">
          <input type="hidden" name={name} value={loc} />
          <span className="min-w-0 flex-1 truncate rounded-lg border border-line bg-sheet px-3 py-1.5 text-sm text-ink">
            {loc}
          </span>
          <button
            type="button"
            onClick={() => removeLocation(loc)}
            className="shrink-0 rounded px-2 py-1 text-xs text-ink-faint hover:bg-deep hover:text-ink"
            aria-label={`Remove ${loc}`}
            suppressHydrationWarning
          >
            Remove
          </button>
        </div>
      ))}

      <div className="relative">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              setSuggestions([]);
              setActiveIndex(-1);
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (!suggestions.length) return;
              setActiveIndex((prev) => (prev + 1) % suggestions.length);
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              if (!suggestions.length) return;
              setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              if (activeIndex >= 0 && suggestions[activeIndex]) {
                pickSuggestion(activeIndex);
                return;
              }
              if (suggestions[0]) {
                pickSuggestion(0);
                return;
              }
              if (trimmed) addLocation(trimmed);
            }
          }}
          placeholder="Search city or metro area"
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          className="w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink shadow-sm transition hover:border-brand/40"
        />
        {showDropdown && (
          <ul className="absolute z-30 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-line bg-sheet py-1 shadow-lg">
            {loading && (
              <li className="px-3 py-1.5 text-sm text-ink-faint">Searching locations…</li>
            )}
            {!loading &&
              suggestions.map((s, index) => (
                <li key={`${s.label}-${s.lat}`}>
                  <button
                    type="button"
                    className={`w-full px-3 py-1.5 text-left text-sm hover:bg-deep ${
                      index === activeIndex ? 'bg-deep text-brand' : 'text-ink-soft'
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => addLocation(s.label)}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            {showManualAdd && (
              <li>
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left text-sm text-ink-faint hover:bg-deep"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addLocation(trimmed)}
                >
                  Use &ldquo;{trimmed}&rdquo; as typed
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
