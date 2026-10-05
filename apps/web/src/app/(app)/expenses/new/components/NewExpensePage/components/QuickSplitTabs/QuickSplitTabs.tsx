"use client";

import type { NewExpenseController } from "../../hooks/useNewExpense";

export function QuickSplitTabs({ form }: { form: NewExpenseController }) {
  if (form.quickSplitTabData.length === 0) return null;
  return (
    <div className="grid grid-cols-3 rounded-xl bg-paper p-1 text-xs font-semibold ring-1 ring-line sm:text-sm">
      {form.quickSplitTabData.map((quickSplitTab) => (
        <button
          key={quickSplitTab.value}
          type="button"
          onClick={() => form.setQuickSplit(quickSplitTab.value)}
          className={`rounded-lg py-2.5 transition-colors sm:py-2 ${
            form.quickSplit === quickSplitTab.value
              ? "bg-card text-brand-700 shadow-sm"
              : "text-ink-soft"
          }`}
        >
          {quickSplitTab.label}
        </button>
      ))}
    </div>
  );
}
