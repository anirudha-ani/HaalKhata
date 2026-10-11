/** Tests for the insights wording helpers: local months, durations, labels and tail folding. */

import { describe, expect, it } from "vitest";
import {
  averagePerMonth,
  calendarDayLabel,
  categoryLabel,
  countLabel,
  currentLocalMonth,
  foldTail,
  memberDuration,
  monthShortLabel,
  percentLabel,
  splitTypeLabel,
} from "./insights";

describe("currentLocalMonth", () => {
  it("reads the month off the local clock, zero-padded", () => {
    expect(currentLocalMonth(new Date(2026, 9, 11))).toBe("2026-10");
    expect(currentLocalMonth(new Date(2027, 0, 1))).toBe("2027-01");
  });

  it("stays in the old month until local midnight", () => {
    expect(currentLocalMonth(new Date(2026, 8, 30, 23, 59))).toBe("2026-09");
  });
});

describe("monthShortLabel", () => {
  it("names the month a key stands for", () => {
    const expected = new Date(2026, 9, 1).toLocaleDateString(undefined, { month: "short" });
    expect(monthShortLabel("2026-10")).toBe(expected);
  });

  it("returns anything that is not a month key untouched", () => {
    expect(monthShortLabel("soon")).toBe("soon");
  });
});

describe("labels", () => {
  it("capitalizes a category key", () => {
    expect(categoryLabel("groceries")).toBe("Groceries");
    expect(categoryLabel("")).toBe("General");
  });

  it("spells split types the way the expense form does", () => {
    expect(splitTypeLabel("equal")).toBe("Equally");
    expect(splitTypeLabel("exact")).toBe("Amounts");
    expect(splitTypeLabel("itemized")).toBe("Itemized");
  });

  it("still shows a split type this build has never heard of", () => {
    expect(splitTypeLabel("auction")).toBe("Auction");
  });

  it("pluralizes by count", () => {
    expect(countLabel(1, "expense")).toBe("1 expense");
    expect(countLabel(0, "expense")).toBe("0 expenses");
    expect(countLabel(12, "payment")).toBe("12 payments");
  });
});

describe("memberDuration", () => {
  const nowTime = new Date(2026, 9, 11, 15, 0);

  it("says today for someone who joined this morning", () => {
    expect(memberDuration(new Date(2026, 9, 11, 8, 0).toISOString(), nowTime)).toBe("today");
  });

  it("counts days inside the first month", () => {
    expect(memberDuration(new Date(2026, 9, 10, 23, 0).toISOString(), nowTime)).toBe("1 day");
    expect(memberDuration(new Date(2026, 8, 29, 9, 0).toISOString(), nowTime)).toBe("12 days");
  });

  it("counts whole months, not days divided by thirty", () => {
    expect(memberDuration(new Date(2026, 8, 11, 9, 0).toISOString(), nowTime)).toBe("1 month");
    expect(memberDuration(new Date(2026, 6, 3, 9, 0).toISOString(), nowTime)).toBe("3 months");
  });

  it("does not round a month up before its day comes round", () => {
    expect(memberDuration(new Date(2026, 8, 12, 9, 0).toISOString(), nowTime)).toBe("29 days");
  });

  it("switches to years, with the leftover months", () => {
    expect(memberDuration(new Date(2025, 9, 11, 9, 0).toISOString(), nowTime)).toBe("1 year");
    expect(memberDuration(new Date(2024, 5, 1, 9, 0).toISOString(), nowTime)).toBe(
      "2 years, 4 months",
    );
  });

  it("says nothing for a join date it cannot read or that has not happened", () => {
    expect(memberDuration("not a date", nowTime)).toBe("");
    expect(memberDuration(new Date(2027, 0, 1).toISOString(), nowTime)).toBe("");
  });
});

describe("calendarDayLabel", () => {
  it("formats the day that was written, whatever the timezone", () => {
    const expected = new Date(2026, 6, 14).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    expect(calendarDayLabel("2026-07-14")).toBe(expected);
  });

  it("returns nothing for text that is not a day", () => {
    expect(calendarDayLabel("")).toBe("");
    expect(calendarDayLabel("2026-07")).toBe("");
  });
});

describe("percentLabel", () => {
  it("rounds to a whole percentage", () => {
    expect(percentLabel(38, 100)).toBe("38%");
    expect(percentLabel(1, 3)).toBe("33%");
    expect(percentLabel(5, 5)).toBe("100%");
  });

  it("does not call a small but real share zero", () => {
    expect(percentLabel(1, 1000)).toBe("<1%");
    expect(percentLabel(0, 1000)).toBe("0%");
  });

  it("says nothing when there is no whole", () => {
    expect(percentLabel(5, 0)).toBe("");
    expect(percentLabel(-1, 10)).toBe("");
  });
});

describe("averagePerMonth", () => {
  it("rounds to the nearest minor unit", () => {
    expect(averagePerMonth(1000, 3)).toBe(333);
    expect(averagePerMonth(2000, 3)).toBe(667);
  });

  it("is zero for a window with no months", () => {
    expect(averagePerMonth(1000, 0)).toBe(0);
  });
});

describe("foldTail", () => {
  /** Sums a tail into one entry labelled "other". */
  const fold = (tail: readonly { name: string; value: number }[]) => ({
    name: "other",
    value: tail.reduce((total, entry) => total + entry.value, 0),
  });
  const ranked = [
    { name: "food", value: 50 },
    { name: "travel", value: 30 },
    { name: "housing", value: 10 },
    { name: "health", value: 6 },
    { name: "shopping", value: 4 },
  ];

  it("leaves a list that already fits alone", () => {
    expect(foldTail(ranked, 5, fold)).toEqual(ranked);
    expect(foldTail(ranked.slice(0, 2), 5, fold)).toEqual(ranked.slice(0, 2));
  });

  it("folds everything past the head into one trailing entry", () => {
    expect(foldTail(ranked, 3, fold)).toEqual([
      { name: "food", value: 50 },
      { name: "travel", value: 30 },
      { name: "other", value: 20 },
    ]);
  });

  it("loses nothing: the folded list adds up to the original", () => {
    const total = (entries: readonly { value: number }[]) =>
      entries.reduce((runningTotal, entry) => runningTotal + entry.value, 0);
    expect(total(foldTail(ranked, 2, fold))).toBe(total(ranked));
  });

  it("does not mutate the list it was given", () => {
    const copy = [...ranked];
    foldTail(ranked, 2, fold);
    expect(ranked).toEqual(copy);
  });
});
