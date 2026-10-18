/** Development builds only: the small "Password" link beside the brand, and the sheet it opens. */

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PASSWORD_AUTH_ENABLED } from "../../../../constants/googleSignIn";
import { PasswordSheet } from "../PasswordSheet/PasswordSheet";

/**
 * Keeps the seeded-account form one tap away in development without
 * taking room from the docked Apple and Google buttons, so a development
 * build lays out the welcome screen the way a release build does. Renders
 * nothing in a release build, where the server refuses passwords anyway.
 *
 * @returns The link and, while open, the password sheet.
 */
export function DevPasswordButton() {
  const [open, setOpen] = useState(false);
  if (!PASSWORD_AUTH_ENABLED) return null;
  return (
    <>
      <Button compact label="Password (dev)" onPress={() => setOpen(true)} variant="ghost" />
      {open ? <PasswordSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}
