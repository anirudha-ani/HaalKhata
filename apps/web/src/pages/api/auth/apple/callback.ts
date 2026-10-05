/** Apple form-post callback: decode transport fields, verify through the usecase, redirect. */

import type { NextApiRequest, NextApiResponse } from "next";
import { handleAppleCallback } from "@/server/auth/usecase/appleSignIn.usecase";
import { ensureMigrated } from "@/server/common/db";

/** Restricts Apple's form post to a small body; it never accepts a local session token. */
export const config = { api: { bodyParser: { sizeLimit: "32kb" } } };

/**
 * Processes the signed-identity OAuth callback, never using browser cookies for authorization.
 * @param request Apple's URL-encoded form post.
 * @param response Redirect or sanitized failure.
 */
export default async function appleCallback(request: NextApiRequest, response: NextApiResponse) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Referrer-Policy", "no-referrer");
  if (request.method !== "POST") { response.setHeader("Allow", "POST"); response.status(405).end(); return; }
  try {
    await ensureMigrated();
    const fields = request.body as Record<string, unknown>;
    let name = "";
    if (typeof fields.user === "string") {
      try {
        const profile = JSON.parse(fields.user) as { name?: { firstName?: string; lastName?: string } };
        name = [profile.name?.firstName, profile.name?.lastName].filter((part) => typeof part === "string").join(" ");
      } catch { /* Optional first-use name never authorizes the account. */ }
    }
    const destination = await handleAppleCallback({ state: typeof fields.state === "string" ? fields.state : "",
      code: typeof fields.code === "string" ? fields.code : "", name, cancelled: fields.error === "user_cancelled_authorize" });
    response.redirect(303, destination);
  } catch { response.status(400).send("Apple sign-in could not finish. Return to HaalKhata and try again."); }
}
