"use client";
/** Overflow menu: a "more" button (three vertical dots) that drops a short list of page-level actions. */

import { EllipsisVertical } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { ENABLED_MENU_ITEM_SELECTOR } from "./constants/overflowMenu";

/** One action in an overflow menu. */
export interface OverflowMenuItem {
  /** The words on the row; also its key, so labels must be unique within a menu. */
  label: string;
  /** Leading icon, sized by the caller (16 pixels reads well). */
  icon: ReactNode;
  /** Runs after the menu has closed. */
  onSelect: () => void;
  /** Dims the row and ignores it, e.g. while its action is already in flight. */
  disabled?: boolean;
}

/**
 * Renders a square "more" button that opens a menu of actions under it,
 * aligned to its right edge so it never runs off a phone screen from the top
 * right corner where it lives.
 *
 * It behaves as a menu: opening it moves focus to the first action, the
 * arrow keys (and Home/End) move between actions, Escape closes it and gives
 * focus back to the button, and so does Tab. A tap anywhere outside closes
 * it — `pointerdown` rather than `mousedown`, which iOS only synthesizes for
 * taps that land on something clickable.
 *
 * @param props - Component props.
 * @returns The button and, while open, its menu.
 */
export function OverflowMenu({
  label,
  items,
}: {
  /** Accessible name of the button, e.g. "Group options". */
  label: string;
  /** The actions, in display order. */
  items: OverflowMenuItem[];
}) {
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  /** Closes the menu, handing focus back to its button when the keyboard closed it. */
  const close = useCallback((restoreFocus: boolean) => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>(ENABLED_MENU_ITEM_SELECTOR)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Marked handled, the way Modal expects of anything that uses the key first.
      event.preventDefault();
      close(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isOpen, close]);

  /**
   * Moves focus between actions with the arrow keys, Home and End, wrapping
   * at either end; Tab leaves the menu and closes it.
   *
   * @param event - The key press inside the menu.
   */
  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      close(false);
      return;
    }
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(ENABLED_MENU_ITEM_SELECTOR),
    );
    if (focusable.length === 0) return;
    const current = focusable.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "ArrowDown"
        ? (current + 1) % focusable.length
        : event.key === "ArrowUp"
          ? (current - 1 + focusable.length) % focusable.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? focusable.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    focusable[next]?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (isOpen ? close(false) : setIsOpen(true))}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        className={`flex h-10 w-10 items-center justify-center rounded-xl border bg-card transition-colors hover:border-brand-200 hover:text-brand-600 ${
          isOpen ? "border-brand-200 text-brand-600" : "border-line text-ink-soft"
        }`}
      >
        <EllipsisVertical className="h-5 w-5" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute top-full right-0 z-20 mt-1.5 w-56 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-lg shadow-ink/10"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
              className="flex h-11 w-full items-center gap-3 px-3.5 text-left text-sm font-medium text-ink outline-none hover:bg-paper focus-visible:bg-paper disabled:opacity-50"
            >
              <span className="shrink-0 text-ink-soft" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
