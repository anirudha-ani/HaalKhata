"use client";
/** Caller-owned blocked people and explicit unblock actions. */

import { errorMessage } from "@/lib/api/connect";
import { useSafetyAPI } from "@/lib/hooks/useSafetyAPI";

/**
 * Renders account safety settings with visible retryable failures.
 * @returns Blocked accounts and unblock controls.
 */
export function BlockedPeople() {
  const safety = useSafetyAPI();
  return <section className="space-y-2 text-sm"><h3 className="text-base font-semibold">Blocked people</h3>
    {safety.blocks.isPending ? <p>Loading…</p> : safety.blocks.error ? <>
      <p role="alert">{errorMessage(safety.blocks.error)}</p><button type="button" className="underline" onClick={() => { void safety.blocks.refetch(); }}>Retry</button>
    </> : safety.blocks.data?.users.length ? safety.blocks.data.users.map((person) => <div key={person.id} className="flex flex-wrap items-center justify-between gap-2">
      <span>{person.name}</span><button type="button" className="py-2 underline" disabled={safety.unblock.isPending} onClick={() => safety.unblock.mutate(person.id)}>Unblock</button>
    </div>) : <p className="text-ink-soft">You have not blocked anyone.</p>}
    {safety.unblock.error ? <p role="alert">{errorMessage(safety.unblock.error)}</p> : null}
  </section>;
}
