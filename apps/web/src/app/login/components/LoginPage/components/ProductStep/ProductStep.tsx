"use client";
/** Product step: one row of the login page's three-step explainer. */

import { type ReactNode } from "react";

/**
 * Renders a product promise in the concise three-step explainer.
 *
 * @param props - Step number, icon, title and supporting detail.
 * @returns One product-explanation row.
 */
export function ProductStep({
  number,
  icon,
  title,
  detail,
}: {
  number: string;
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <article className="group border-t border-line py-5 sm:py-6">
      <div className="flex items-start gap-4">
        <span className="mt-1 text-xs font-bold tracking-[0.16em] text-brand-600">{number}</span>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-card text-brand-600 transition-transform group-hover:-rotate-3 group-hover:scale-105">
          {icon}
        </span>
        <div>
          <h3 className="text-xl font-bold">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-ink-soft">{detail}</p>
        </div>
      </div>
    </article>
  );
}
