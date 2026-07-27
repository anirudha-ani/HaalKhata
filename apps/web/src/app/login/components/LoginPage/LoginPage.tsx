"use client";
/** Login route UI: sign-in / create-account toggle and credentials form. */

import { useLogin } from "./hooks/useLogin";
import { useGoogleSignIn } from "./hooks/useGoogleSignIn";

/** Shared styling for the credential text inputs. */
const inputClass =
  "w-full rounded-xl border border-line bg-card px-3.5 py-3 text-[15px] focus:border-brand-500 focus:outline-none";

/**
 * Renders the login page: the HaalKhata wordmark, the sign-in/create-account
 * mode toggle, and the credentials form (name appears only in signup mode).
 *
 * @returns The full-height login screen.
 */
export function LoginPage() {
  const login = useLogin();
  // Destructured rather than kept as one object: passing a member to a `ref`
  // prop makes the whole object read as ref-typed to the react-hooks lint rule.
  const {
    setButtonElement,
    error: googleError,
    isPending: googleIsPending,
    isConfigured: googleIsConfigured,
  } = useGoogleSignIn();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-5xl font-bold text-brand-600">HaalKhata</h1>
          <p className="mt-4 text-ink-soft">
            A fresh ledger for you and your friends — split expenses, scan
            receipts, settle up.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
          {googleIsConfigured ? (
            <div className="mb-5 flex flex-col gap-3">
              <div ref={setButtonElement} className="flex justify-center [color-scheme:light]" />
              {googleIsPending ? (
                <p className="text-center text-sm text-ink-soft">Opening your ledger…</p>
              ) : null}
              {googleError ? (
                <p className="text-center text-sm text-brand-600">{googleError}</p>
              ) : null}
              <div className="flex items-center gap-3 text-xs text-ink-soft">
                <span className="h-px flex-1 bg-line" />
                or use a password
                <span className="h-px flex-1 bg-line" />
              </div>
            </div>
          ) : null}

          <div className="mb-5 grid grid-cols-2 rounded-xl bg-paper p-1 text-sm font-semibold">
            {(["login", "signup"] as const).map((modeOption) => (
              <button
                key={modeOption}
                type="button"
                onClick={() => login.switchMode(modeOption)}
                className={`rounded-lg py-2 transition-colors ${
                  login.mode === modeOption ? "bg-card text-brand-700 shadow-sm" : "text-ink-soft"
                }`}
              >
                {modeOption === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              login.submit();
            }}
          >
            {login.mode === "signup" ? (
              <input
                className={inputClass}
                placeholder="Your name"
                aria-label="Your name"
                value={login.name}
                onChange={(event) => login.setName(event.target.value)}
                autoComplete="name"
                required
              />
            ) : null}
            <input
              className={inputClass}
              type="text"
              placeholder="Email or phone"
              aria-label="Email or phone"
              value={login.identifier}
              onChange={(event) => login.setIdentifier(event.target.value)}
              autoComplete="username"
              required
            />
            <input
              className={inputClass}
              type="password"
              placeholder="Password"
              aria-label="Password"
              value={login.password}
              onChange={(event) => login.setPassword(event.target.value)}
              autoComplete={login.mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
            />

            {login.error ? <p className="text-sm text-brand-600">{login.error}</p> : null}

            <button
              type="submit"
              disabled={login.isPending}
              className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {login.isPending
                ? "One moment…"
                : login.mode === "login"
                  ? "Sign in"
                  : "Open your ledger"}
            </button>
          </form>

          {login.mode === "signup" ? (
            <p className="mt-4 text-xs leading-relaxed text-ink-soft">
              Invited by a friend? Sign up with the same email or phone and
              your shared expenses will already be here.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
