export type QuickSplitType = "split" | "theyOweAll" | "youOweAll";

export function quickSplitTabData(
  otherName: string,
  amount: string,
): { value: QuickSplitType; label: string }[] {
  const owed = amount || "the full amount";
  return [
    { value: "split", label: "Split it" },
    { value: "theyOweAll", label: `${otherName} owes you ${owed}` },
    { value: "youOweAll", label: `You owe ${otherName} ${owed}` },
  ];
}

export function quickSplitOf(form: {
  meId: string;
  otherId: string;
  payerId: string;
  checked: Record<string, boolean>;
}): QuickSplitType {
  const { meId, otherId, payerId, checked } = form;
  if (payerId === meId && !checked[meId] && checked[otherId]) return "theyOweAll";
  if (payerId === otherId && checked[meId] && !checked[otherId]) return "youOweAll";
  return "split";
}
