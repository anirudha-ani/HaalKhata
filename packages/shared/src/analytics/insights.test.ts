/** Tests for the insights wording helpers: local months, durations, labels and tail folding. */

import { describe, expect, it } from "vitest";
import {
  averagePerMonth,
  calendarDay,
  calendarDayLabel,
  categoryLabel,
  countLabel,
  currentLocalMonth,
  insightRangePhrase,
  insightsLoadError,
  memberDuration,
  monthShortLabel,
  percentLabel,
  pickActiveMonth,
  pickCurrencyBlock,
  rankCategorySpending,
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

  it("does not count a first day as zero days", () => {
    expect(memberDuration(new Date(2026, 9, 11, 8, 0).toISOString(), nowTime)).toBe(
      "a few hours",
    );
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

  it("reaches a month on the 1st after a month too short to hold the join day", () => {
    const joined = new Date(2026, 0, 31, 9, 0).toISOString();
    // February has no 31st: still a day count on its last day.
    expect(memberDuration(joined, new Date(2026, 1, 28, 12, 0))).toBe("28 days");
    expect(memberDuration(joined, new Date(2026, 2, 1, 12, 0))).toBe("1 month");
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

  it("reads a join just past a clock that runs behind as just joined", () => {
    expect(memberDuration(new Date(2026, 9, 11, 15, 0, 4).toISOString(), nowTime)).toBe(
      "a few hours",
    );
    expect(memberDuration(new Date(2026, 9, 11, 22, 0).toISOString(), nowTime)).toBe(
      "a few hours",
    );
    expect(memberDuration(new Date(2026, 9, 12, 16, 0).toISOString(), nowTime)).toBe("");
  });
});

describe("calendarDay", () => {
  it("reads the day that was written, whatever the timezone", () => {
    expect(calendarDay("2026-10-05")?.getDate()).toBe(5);
  });

  it("refuses anything that is not a day", () => {
    expect(calendarDay("soon")).toBeNull();
    expect(calendarDay("2026-10")).toBeNull();
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

describe("rankCategorySpending", () => {
  /**
   * Builds a category row.
   *
   * @param category - Category key.
   * @param shareCents - The person's share.
   * @returns The row.
   */
  const share = (category: string, shareCents: number) => ({ category, shareCents });
  const sixCategories = [
    share("food", 5000),
    share("travel", 3000),
    share("housing", 1000),
    share("health", 600),
    share("shopping", 400),
    share("transport", 200),
  ];

  it("leaves a list that already fits alone, largest first", () => {
    expect(rankCategorySpending([share("travel", 3000), share("food", 5000)], 5)).toEqual([
      share("food", 5000),
      share("travel", 3000),
    ]);
  });

  it("drops a category with no share of the person's own in it", () => {
    expect(rankCategorySpending([share("food", 5000), share("general", 0)], 5)).toEqual([
      share("food", 5000),
    ]);
  });

  it("folds everything past the head into one trailing row", () => {
    expect(rankCategorySpending(sixCategories, 5)).toEqual([
      share("food", 5000),
      share("travel", 3000),
      share("housing", 1000),
      share("health", 600),
      share("other", 600),
    ]);
  });

  it("loses nothing: the folded list adds up to the original", () => {
    const total = (entries: readonly { shareCents: number }[]) =>
      entries.reduce((running, entry) => running + entry.shareCents, 0);
    expect(total(rankCategorySpending(sixCategories, 3))).toBe(total(sixCategories));
  });

  it("merges a real 'other' category into the folded row instead of showing two", () => {
    // The real "other" ranks second, well inside the head.
    const withRealOther = [...sixCategories, share("other", 4000)];

    const ranked = rankCategorySpending(withRealOther, 5);

    expect(ranked.map((entry) => entry.category)).toEqual([
      "food",
      "travel",
      "housing",
      "health",
      "other",
    ]);
    expect(new Set(ranked.map((entry) => entry.category)).size).toBe(ranked.length);
    // The real row (4000) plus the two folded small ones (400 + 200).
    expect(ranked[4]).toEqual(share("other", 4600));
  });

  it("keeps a real 'other' in its own ranked place when nothing is folded", () => {
    expect(
      rankCategorySpending([share("food", 100), share("other", 900), share("travel", 500)], 5),
    ).toEqual([share("other", 900), share("travel", 500), share("food", 100)]);
  });

  it("does not mutate the list it was given", () => {
    const original = [...sixCategories];
    rankCategorySpending(sixCategories, 2);
    expect(sixCategories).toEqual(original);
  });
});

describe("pickCurrencyBlock", () => {
  const blocks = [{ currency: "USD" }, { currency: "EUR" }];

  it("shows the chosen currency when the data has it", () => {
    expect(pickCurrencyBlock(blocks, "EUR")).toBe(blocks[1]);
  });

  it("falls back to the first block for no choice or one the data lacks", () => {
    expect(pickCurrencyBlock(blocks, "")).toBe(blocks[0]);
    expect(pickCurrencyBlock(blocks, "JPY")).toBe(blocks[0]);
  });

  it("has nothing to show when there is no money in the window", () => {
    expect(pickCurrencyBlock([], "USD")).toBeUndefined();
  });
});

describe("pickActiveMonth", () => {
  const months = ["2026-08", "2026-09", "2026-10"];

  it("keeps a chosen month that is still in the window", () => {
    expect(pickActiveMonth(months, "2026-09")).toBe("2026-09");
  });

  it("falls back to the newest month", () => {
    expect(pickActiveMonth(months, "")).toBe("2026-10");
    expect(pickActiveMonth(months, "2025-01")).toBe("2026-10");
  });

  it("is empty for an empty window", () => {
    expect(pickActiveMonth([], "2026-10")).toBe("");
  });
});

describe("insightsLoadError", () => {
  it("names the dashboard when nothing has loaded", () => {
    expect(insightsLoadError("Network down")).toBe("Couldn't load your insights: Network down");
  });

  it("names the period that failed and the one still shown", () => {
    expect(insightsLoadError("Network down", { failed: 12, shown: 6 })).toBe(
      "Couldn't load the last year: Network down. Showing the last 6 months.",
    );
    expect(insightsLoadError("Try again later.", { failed: 3, shown: 12 })).toBe(
      "Couldn't load the last 3 months: Try again later. Showing the last year.",
    );
  });
});

describe("insightRangePhrase", () => {
  it("reads every offered window as a phrase", () => {
    expect([3, 6, 12].map((range) => insightRangePhrase(range as 3 | 6 | 12))).toEqual([
      "the last 3 months",
      "the last 6 months",
      "the last year",
    ]);
  });
});
