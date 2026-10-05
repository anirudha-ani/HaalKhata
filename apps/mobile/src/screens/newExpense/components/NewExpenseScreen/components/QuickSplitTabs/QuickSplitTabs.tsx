import { Segmented } from "@/components/ui/Segmented";
import type { NewExpenseController } from "../../hooks/useNewExpense";

export function QuickSplitTabs({ form }: { form: NewExpenseController }) {
  if (form.quickSplitTabData.length === 0) return null;
  return (
    <Segmented onChange={form.setQuickSplit} options={form.quickSplitTabData} value={form.quickSplit} />
  );
}
