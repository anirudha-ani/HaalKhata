/** Destructive-action confirmation and provider-revocation failure regressions. */

import { beforeEach, expect, it, vi } from "vitest";
import * as repository from "../repo/accountDeletion.repo";
import * as appleRepository from "../repo/appleSignIn.repo";
import * as provider from "./apple.provider";
import { deleteAccount } from "./accountDeletion.usecase";

vi.mock("@/server/common/db", () => ({ newId: () => "new-anonymous-id", transaction: async (work: (client: object) => unknown) => work({}) }));
vi.mock("../repo/accountDeletion.repo", () => ({ lockAccountForDeletion: vi.fn(), insertAnonymousLedgerMember: vi.fn(),
  listDeletionGroupMembers: vi.fn(), transferDeletionGroupOwnership: vi.fn(), eraseAccountData: vi.fn() }));
vi.mock("../repo/appleSignIn.repo", () => ({ listAppleCredentials: vi.fn() }));
vi.mock("./apple.provider", () => ({ revokeAppleToken: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); });

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
