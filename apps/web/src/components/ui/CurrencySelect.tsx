"use client";
/** Searchable currency combobox over the full ISO catalog (§36). */

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  CURRENCIES,
  currencyInfo,
  currencyOptionLabel,
  type CurrencyInfo,
} from "@haalkhata/shared/money/money.constants";

/**
 * Whether a catalog row matches a search query, on code, name, or symbol.
 *
 * @param info - Candidate currency.
 * @param query - Lowercased search text.
 * @returns True when the row should stay listed.
 */
function matches(info: CurrencyInfo, query: string): boolean {
  return (
    info.code.toLowerCase().includes(query) ||
    info.name.toLowerCase().includes(query) ||
    info.symbol.toLowerCase().includes(query)
  );
}

/**
 * Renders a currency field with a searchable dropdown: a button showing the
 * current choice with its symbol, opening a panel with a filter box over the
 * full catalog. A native select was fine for eight currencies; ~155 need
 * typing "tak" more than they need scrolling past Tajikistan.
 *
 * Keyboard: arrows move, Enter picks, Escape closes. Focus leaving the
 * component closes it, so it needs no document-level listeners.
 *
 * @param props - Component props.
 * @param props.value - The selected ISO 4217 code.
 * @param props.onChange - Called with the newly picked code.
 * @param props.ariaLabel - Accessible name for the field; defaults to "Currency".
 * @returns The field and, while open, its dropdown.
 */
export function CurrencySelect({
  value,
  onChange,
  ariaLabel = "Currency",
}: {
  value: string;
  onChange: (code: string) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const needle = query.trim().toLowerCase();
  const options = needle === "" ? CURRENCIES : CURRENCIES.filter((info) => matches(info, needle));
  // Clamped on render rather than reset in an effect: the list shrinks as
  // the user types, and the highlight must never point past its end.
  const active = options.length === 0 ? -1 : Math.min(activeIndex, options.length - 1);
  const selected = currencyInfo(value);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  const pick = (code: string) => {
    onChange(code);
    close();
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(Math.min(active + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(Math.max(active - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const choice = options[active];
      if (choice) pick(choice.code);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <div
      className="relative"
      onBlur={(event) => {
        // Focus moving within the component (button ↔ search box) must not
        // close it; only focus actually leaving does.
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : setOpen(true))}
        className="mt-1 flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-card px-3 py-2.5 text-left focus:border-brand-500 focus:outline-none"
      >
        <span className="truncate">
          {selected ? currencyOptionLabel(selected) : value || "Pick a currency"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-soft" />
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-line bg-card shadow-lg">
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder="Search code or name, e.g. USD or US dollar"
            aria-label="Search currencies"
            className="w-full border-b border-line bg-card px-3 py-2 text-sm focus:outline-none"
          />
          <ul ref={listRef} role="listbox" aria-label={ariaLabel} className="max-h-60 overflow-y-auto py-1">
            {options.map((info, index) => (
              <li
                key={info.code}
                role="option"
                aria-selected={info.code === value}
                data-active={index === active || undefined}
              >
                <button
                  type="button"
                  // Keeps focus on the search box so the container's blur
                  // handler cannot close the panel before this click lands.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(info.code)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-paper ${
                    index === active ? "bg-paper" : ""
                  }`}
                >
                  <span className="w-8 shrink-0">{info.symbol}</span>
                  <span className="font-semibold">{info.code}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-soft">{info.name}</span>
                  {info.code === value ? (
                    <Check className="h-4 w-4 shrink-0 text-brand-600" />
                  ) : null}
                </button>
              </li>
            ))}
            {options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ink-soft">No currency matches that.</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
