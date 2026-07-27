/** Copy-to-clipboard that still works outside a secure context. */

/**
 * Copies text to the clipboard, falling back when the async Clipboard API is
 * unavailable.
 *
 * `navigator.clipboard` is exposed only in a *secure context*. `localhost`
 * qualifies; `http://192.168.x.x:3000` — how a phone on the same wifi reaches
 * a dev server — does not, so `navigator.clipboard` is `undefined` there and
 * reading `.writeText` off it throws. Copying a Venmo handle is precisely a
 * phone action, so the one place it has to work is the one place the modern
 * API is missing.
 *
 * The fallback is the old `document.execCommand("copy")` over an offscreen
 * textarea. It is deprecated, and it is also the only thing that works here.
 *
 * @param text - The text to place on the clipboard.
 * @returns True when the text was copied.
 */
export async function copyText(text: string): Promise<boolean> {
  if (text === "") return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied, or a browser that exposes the API but refuses the
      // write. Fall through rather than surfacing a dead button.
    }
  }

  try {
    const field = document.createElement("textarea");
    field.value = text;
    // Off screen but still focusable: `display: none` or `hidden` cannot be
    // selected, and execCommand copies the selection.
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "-1000px";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    // iOS ignores select() on a readonly field unless given an explicit range.
    field.setSelectionRange(0, text.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(field);
    return copied;
  } catch {
    return false;
  }
}
