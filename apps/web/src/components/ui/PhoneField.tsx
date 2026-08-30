"use client";
/** Phone input: searchable country picker on the left, national number on the right. */

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { matchesTerms, searchTerms } from "@haalkhata/shared/search/filter";
import { PHONE_COUNTRIES, phoneCountry, splitE164 } from "@haalkhata/shared/phone/phone";
import { SearchField } from "./SearchField";

/**
 * Renders a phone number as the two things it actually is: a country and a
 * national number. One bordered group so it still reads as a single field.
 *
 * The country side is a combobox rather than a `<select>`, because a native
 * select renders the same string collapsed as in its list. With 240 countries
 * that forces a choice between a trigger wide enough to show "🇧🇩 Bangladesh
 * +880" and a list showing only "🇧🇩 +880", which cannot be scanned. A listbox
 * shows the short form in the trigger and the full name in the list.
 *
 * @param props - Component props.
 * @returns The phone field.
 */
export function PhoneField({
  region,
  nationalNumber,
  onRegionChange,
  onNationalNumberChange,
  placeholder = "(617) 555-1212",
  label = "Phone number",
}: {
  /** Selected ISO 3166-1 alpha-2 region code. */
  region: string;
  /** National number as typed, without the country code. */
  nationalNumber: string;
  /** Called with the region code when the user picks a country. */
  onRegionChange: (region: string) => void;
  /** Called with the raw text of the number box on every keystroke. */
  onNationalNumberChange: (nationalNumber: string) => void;
  /** Placeholder for the number box. */
  placeholder?: string;
  /** Accessible label for the number box. */
  label?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = phoneCountry(region);
  const terms = searchTerms(query);
  // Name, dial code and region code are all searched, so "bang", "880" and
  // "BD" each find Bangladesh — people reach for whichever they know.
  const matches = PHONE_COUNTRIES.filter((country) =>
    matchesTerms(terms, country.name, country.dialCode, country.region),
  );

  // Escape closes, and so does a click outside: an open listbox that survives
  // a click elsewhere on the form traps the next thing the user tries to do.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [isOpen]);

  /**
   * Picks a country and closes the list, clearing the query so the next open
   * starts from the whole set rather than the last search.
   *
   * @param nextRegion - Region code of the country chosen.
   */
  const choose = (nextRegion: string) => {
    onRegionChange(nextRegion);
    setQuery("");
    setIsOpen(false);
  };

  /**
   * Handles typing or pasting in the number box. A value that arrives as a
   * full international number sets the country from it instead of being
   * appended to whichever country happens to be selected.
   *
   * @param value - The number box's new raw value.
   */
  const changeNumber = (value: string) => {
    const pasted = splitE164(value);
    if (pasted) {
      onRegionChange(pasted.region);
      onNationalNumberChange(pasted.nationalNumber);
      return;
    }
    onNationalNumberChange(value);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-stretch rounded-xl border border-line bg-card focus-within:border-brand-500">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={`Country: ${selected.name} +${selected.dialCode}`}
          className="flex shrink-0 items-center gap-1.5 rounded-l-xl px-3.5 text-[15px] text-ink hover:bg-paper"
        >
          <span aria-hidden="true">{selected.flag}</span>
          <span className="tabular-nums">+{selected.dialCode}</span>
          <ChevronDown className="h-4 w-4 text-ink-soft" />
        </button>

        <span aria-hidden="true" className="my-2 w-px shrink-0 bg-line" />

        <input
          type="tel"
          value={nationalNumber}
          onChange={(event) => changeNumber(event.target.value)}
          placeholder={placeholder}
          aria-label={label}
          autoComplete="tel-national"
          className="w-full min-w-0 rounded-r-xl bg-transparent px-3.5 py-3 text-[15px] focus:outline-none"
        />
      </div>

      {isOpen ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-line bg-card shadow-lg">
          <div className="p-2">
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Search countries"
              autoFocus
            />
          </div>
          {matches.length === 0 ? (
            <p className="px-3 pb-3 text-sm text-ink-soft">No country matches that.</p>
          ) : (
            <ul role="listbox" aria-label="Country" className="max-h-60 overflow-y-auto pb-1">
              {matches.map((country) => (
                <li key={country.region}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={country.region === selected.region}
                    onClick={() => choose(country.region)}
                    className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm hover:bg-paper ${
                      country.region === selected.region ? "bg-brand-50 text-brand-700" : "text-ink"
                    }`}
                  >
                    <span aria-hidden="true">{country.flag}</span>
                    <span className="min-w-0 flex-1 truncate">{country.name}</span>
                    <span className="shrink-0 text-ink-soft tabular-nums">
                      +{country.dialCode}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
