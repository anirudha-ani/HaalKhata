"use client";
/** One-time card asking an account that never answered whether contacts may find it. */

import { CONTACT_DISCOVERY_PROMPT } from "@haalkhata/shared/contacts/contactsCopy";
import type { ContactDiscovery } from "@haalkhata/shared/contacts/discovery";
import { useContactDiscoveryPrompt } from "./hooks/useContactDiscoveryPrompt";

/**
 * Renders the question with its two answers, or, once answered, what was
 * saved. Renders nothing for someone who answered on an earlier visit.
 *
 * @param props - Component props.
 * @returns The card, or null.
 */
export function ContactDiscoveryPrompt({
  answer,
}: {
  /** The caller's stored answer. */
  answer: ContactDiscovery;
}) {
  const prompt = useContactDiscoveryPrompt(answer);
  if (!prompt.visible) return null;
  return (
    <section
      aria-label={CONTACT_DISCOVERY_PROMPT.title}
      className="space-y-3 rounded-2xl border border-line bg-card p-5"
    >
      {prompt.asking ? (
        <>
          <h2 className="font-semibold">{CONTACT_DISCOVERY_PROMPT.title}</h2>
          <p className="text-sm leading-relaxed text-ink-soft">{CONTACT_DISCOVERY_PROMPT.body}</p>
          {prompt.error ? <p role="alert" className="text-sm text-neg-700">{prompt.error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={prompt.busy}
              onClick={() => void prompt.respond(true)}
              className="min-h-11 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {CONTACT_DISCOVERY_PROMPT.allow}
            </button>
            <button
              type="button"
              disabled={prompt.busy}
              onClick={() => void prompt.respond(false)}
              className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold text-ink-soft hover:bg-paper disabled:opacity-60"
            >
              {CONTACT_DISCOVERY_PROMPT.decline}
            </button>
          </div>
        </>
      ) : (
        <p role="status" className="text-sm text-pos-700">{prompt.notice}</p>
      )}
    </section>
  );
}
