/** Where somebody is right now, in full, so a detour can bring them back to the same thing. */

/**
 * Rebuilds the address of the current screen. A path alone is not enough: the
 * edit form says which bill it is in its query, so without it somebody who has
 * just joined a bill would come back to a blank form.
 *
 * @param pathname - The current path.
 * @param params - The current route and query params.
 * @returns The path with its query. A param already in the path is left out.
 */
export function currentHref(pathname: string, params: Record<string, string | string[] | undefined>): string {
  const segments = pathname.split("/");
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === "string" && !segments.includes(value)) query.set(name, value);
  }
  const search = query.toString();
  return search ? `${pathname}?${search}` : pathname;
}
