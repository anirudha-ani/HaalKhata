/** Destructive-action confirmation and provider-revocation failure regressions. */

import { beforeEach, expect, it, vi } from "vitest";
import * as repository from "../../repo/deletion/accountDeletion.repo";
import * as appleRepository from "../../repo/apple/appleSignIn.repo";
import * as provider from "../apple/apple.provider";
import { deleteAccount } from "./accountDeletion.usecase";

vi.mock("@/server/common/ledger/accountContentLocks", () => ({ lockAccountContentForErasure: vi.fn() }));
vi.mock("@/server/common/db/db", () => ({ newId: () => "new-anonymous-id", transaction: async (work: (client: object) => unknown) => work({}) }));
vi.mock("../../repo/deletion/accountDeletion.repo", () => ({ lockDeletionReports: vi.fn(), deletionReportsUnchanged: vi.fn(), lockAccountForDeletion: vi.fn(), insertAnonymousLedgerMember: vi.fn(),
  listDeletionGroupMembers: vi.fn(), transferDeletionGroupOwnership: vi.fn(), eraseAccountData: vi.fn() }));
vi.mock("../../repo/apple/appleSignIn.repo", () => ({ listAppleCredentials: vi.fn() }));
vi.mock("../apple/apple.provider", () => ({ revokeAppleToken: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repository.lockDeletionReports).mockResolvedValue([]);
  vi.mocked(repository.deletionReportsUnchanged).mockResolvedValue(true);
});

it("rejects deletion without an exact confirmation before opening account data", async () => {
  await expect(deleteAccount("caller", "delete")).rejects.toMatchObject({ code: "invalid_argument" });
  expect(repository.lockAccountForDeletion).not.toHaveBeenCalled();
});
it("does not erase any account data when Apple revocation fails", async () => {
  vi.mocked(repository.lockAccountForDeletion).mockResolvedValue({ id: "caller", name: "Member" } as never);
  vi.mocked(appleRepository.listAppleCredentials).mockResolvedValue([{ client_id: "com.haalkhata.app", refresh_token_ciphertext: "encrypted" }]);
  vi.mocked(provider.revokeAppleToken).mockRejectedValue(new Error("provider unavailable"));
  await expect(deleteAccount("caller", "DELETE")).rejects.toThrow("provider unavailable");
  expect(repository.insertAnonymousLedgerMember).not.toHaveBeenCalled();
  expect(repository.eraseAccountData).not.toHaveBeenCalled();
});

it("ends repeated report churn before any erasure or provider side effect", async () => {
  vi.mocked(repository.lockAccountForDeletion).mockResolvedValue({ id: "caller", name: "Member" } as never);
  vi.mocked(repository.deletionReportsUnchanged).mockResolvedValue(false);
  await expect(deleteAccount("caller", "DELETE")).rejects.toMatchObject({ code: "unavailable" });
  expect(repository.insertAnonymousLedgerMember).not.toHaveBeenCalled();
  expect(repository.eraseAccountData).not.toHaveBeenCalled();
  expect(provider.revokeAppleToken).not.toHaveBeenCalled();
});

it("refuses contended bill parents before reading or revoking Apple credentials", async () => {
  vi.mocked(repository.lockAccountForDeletion).mockRejectedValueOnce({ code: "55P03" });
  await expect(deleteAccount("caller", "DELETE")).rejects.toMatchObject({ code: "unavailable" });
  expect(appleRepository.listAppleCredentials).not.toHaveBeenCalled();
  expect(provider.revokeAppleToken).not.toHaveBeenCalled();
  expect(repository.insertAnonymousLedgerMember).not.toHaveBeenCalled();
  expect(repository.eraseAccountData).not.toHaveBeenCalled();
});
