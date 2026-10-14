/** Safety authorization and server-owned snapshots; filters do not mistake substrings for threats. */

import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../repo/safety.repo", () => ({ visibleUser: vi.fn(), insertBlock: vi.fn(), removeBlock: vi.fn(), listBlocks: vi.fn(), commentTarget: vi.fn(), insertReport: vi.fn() }));
vi.mock("@/server/common/db/db", () => ({ transaction: async (work: (client: object) => unknown) => work({}) }));
vi.mock("@/server/expense/usecase/expense.usecase", () => ({ getExpense: vi.fn() }));
vi.mock("@/server/group/repo/groups.repo", () => ({ isMember: vi.fn(), findGroupById: vi.fn() }));
vi.mock("@/server/auth/repo/users.repo", () => ({ findUserById: vi.fn() }));
import * as repository from "../repo/safety.repo";
import { getExpense } from "@/server/expense/usecase/expense.usecase";
import { blockUser, reportContent } from "./safety.usecase";
import { assertSafeText } from "./contentFilter";

beforeEach(() => vi.resetAllMocks());

describe("authorized safety actions", () => {
  it("rejects self-blocking and unseen accounts without writing anything", async () => {
    await expect(blockUser("viewer", "viewer")).rejects.toMatchObject({ code: "invalid_argument" });
    vi.mocked(repository.visibleUser).mockResolvedValue(false);
    await expect(blockUser("viewer", "unknown")).rejects.toMatchObject({ code: "not_found" });
    expect(repository.insertBlock).not.toHaveBeenCalled();
  });
  it("blocks visible accounts without a balance-dependent refusal", async () => {
    vi.mocked(repository.visibleUser).mockResolvedValue(true);
    await blockUser("viewer", "debtor");
    expect(repository.insertBlock).toHaveBeenCalledWith("viewer", "debtor", {});
  });
  it("does not save reports when expense authorization fails", async () => {
    vi.mocked(repository.commentTarget).mockResolvedValue({ user_id: "author", expense_id: "private-expense", body: "Original content" });
    vi.mocked(getExpense).mockRejectedValue(new Error("access denied"));
    await expect(reportContent("viewer", { targetKind: "comment", targetId: "comment", reason: "harassment" })).rejects.toThrow("access denied");
    expect(repository.insertReport).not.toHaveBeenCalled();
  });
  it("stores the original database content, not text supplied by a reporter", async () => {
    vi.mocked(repository.commentTarget).mockResolvedValue({ user_id: "author", expense_id: "shared-expense", body: "Original content" });
    await reportContent("viewer", { targetKind: "comment", targetId: "comment", reason: "spam" });
    expect(repository.insertReport).toHaveBeenCalledWith("viewer", expect.objectContaining({ target: { author_id: "author", snapshot: { body: "Original content", expenseId: "shared-expense" } } }));
  });
  it("rejects unknown report types and reasons before reading private records", async () => {
    await expect(reportContent("viewer", { targetKind: "token", targetId: "secret", reason: "other" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(reportContent("viewer", { targetKind: "user", targetId: "person", reason: "invented" })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repository.visibleUser).not.toHaveBeenCalled();
  });
});

describe("prepublication content filtering", () => {
  it("rejects explicit threats after case and compatibility normalization", () => {
    expect(() => assertSafeText("Please KILL YOURSELF!")).toThrow();
    expect(() => assertSafeText("I will ｒａｐｅ ｙｏｕ")).toThrow();
  });
  it("accepts normal ledger words, names, and substrings", () => {
    for (const text of ["Dinner at Scunthorpe", "Grapefruit", "Kike", "Paid for lunch", "Thanks!"]) expect(() => assertSafeText(text)).not.toThrow();
  });
});
