/** /join/[token] route: resolves the invite token and renders JoinPage. */

import { JoinPage } from "./components/JoinPage/JoinPage";

/**
 * Server entry point for the public /join/[token] route; awaits the dynamic
 * route params and renders the JoinPage client component for that invite.
 *
 * @param props - Next.js page props.
 * @param props.params - Promise resolving to the dynamic route params, where
 *   `token` is the invite token from the URL.
 * @returns The invite landing page element.
 */
export default async function Join({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <JoinPage token={token} />;
}
