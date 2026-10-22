/** Regression coverage for sessions returning to the onboarding route. */

import { create } from "@bufbuild/protobuf";
import { UserSchema } from "@haalkhata/protogen/common/v1/common_pb";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessionUser } from "@/lib/auth/session.server";
import Onboarding from "../page";
import { OnboardingPage } from "../components/OnboardingPage/OnboardingPage";

vi.mock("@/lib/auth/session.server", () => ({ sessionUser: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../components/OnboardingPage/OnboardingPage", () => ({ OnboardingPage: () => null }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(redirect).mockImplementation((destination) => {
    throw new Error(`redirect:${destination}`);
  });
});

describe("onboarding route", () => {
  it("requires a session before showing the profile form", async () => {
    vi.mocked(sessionUser).mockResolvedValue(null);

    await expect(Onboarding()).rejects.toThrow("redirect:/login");
  });

  it("shows onboarding for an account that has not completed it", async () => {
    vi.mocked(sessionUser).mockResolvedValue({
      ...create(UserSchema, { id: "new-user" }),
      paymentHandles: [],
    });

    expect((await Onboarding()).type).toBe(OnboardingPage);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends completed accounts to the dashboard instead of restarting onboarding", async () => {
    vi.mocked(sessionUser).mockResolvedValue({
      ...create(UserSchema, { id: "completed-user", onboarded: true }),
      paymentHandles: [],
    });

    await expect(Onboarding()).rejects.toThrow("redirect:/dashboard");
  });
});
