"use client";
/** Auth panel: the credential form and Google sign-in, as a desktop card or a mobile sheet. */

import { ArrowRight, LockKeyhole, X } from "lucide-react";
import { useLogin } from "../../hooks/useLogin";
import { useGoogleSignIn } from "../../hooks/useGoogleSignIn";
import { LOGIN_INPUT_CLASS } from "../../constants/loginPage";
import styles from "../../LoginPage.module.css";
import { PASSWORD_AUTH_ENABLED } from "@/app/login/constants/googleSignIn";

/**
 * Renders the credential and Google sign-in controls without changing the
 * existing authentication behavior.
 *
 * @param props - Mobile visibility state and close action.
 * @returns The desktop auth card or mobile sign-in sheet.
 */
export function AuthPanel({
  mobileOpen,
  onMobileClose,
}: {
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const login = useLogin();
  const {
    setButtonElement,
    error: googleError,
    isPending: googleIsPending,
    isConfigured: googleIsConfigured,
  } = useGoogleSignIn();
  const isSigningIn = login.mode === "login";

  return (
    <>
      <button
        type="button"
        aria-label="Close sign in"
        onClick={onMobileClose}
        className={`fixed inset-0 z-40 bg-ink/35 backdrop-blur-sm lg:hidden ${mobileOpen ? "block" : "hidden"}`}
      />
      <aside
        id="sign-in"
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen ? true : undefined}
        aria-label={mobileOpen ? "Sign in to HaalKhata" : undefined}
        className={`${styles.authPanel} scroll-mt-6 self-start rounded-[1.75rem] border border-white/80 bg-card/95 p-5 shadow-[0_28px_80px_rgba(83,55,29,0.16)] backdrop-blur-md sm:p-7 lg:sticky lg:inset-auto lg:top-6 lg:z-auto lg:row-span-2 lg:block lg:max-h-none lg:overflow-visible ${
          mobileOpen
            ? "fixed inset-x-3 bottom-3 z-50 block max-h-[calc(100dvh-1.5rem)] overflow-y-auto"
            : "hidden"
        }`}
      >
      <button
        type="button"
        aria-label="Close sign in"
        onClick={onMobileClose}
        className="absolute top-5 right-5 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper text-ink-soft lg:hidden"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="pr-10 lg:pr-0">
          <p className="mb-2 text-[11px] font-bold tracking-[0.18em] text-brand-600 uppercase">
            {isSigningIn ? "Welcome back" : "Start fresh"}
          </p>
          <h2 className="text-3xl font-bold">
            {isSigningIn ? "Your ledger is waiting." : "Open a clean ledger."}
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            {isSigningIn
              ? "Pick up exactly where your group left off."
              : "Create an account and invite people when you are ready."}
          </p>
        </div>
        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-brand-600 lg:flex">
          <LockKeyhole className="h-4 w-4" />
        </span>
      </div>

      {googleIsConfigured ? (
        <div className="flex flex-col gap-3">
          <div ref={setButtonElement} className="flex max-w-full justify-center overflow-hidden [color-scheme:light]" />
          {googleIsPending ? (
            <p className="text-center text-sm text-ink-soft">Opening your ledger…</p>
          ) : null}
          {googleError ? (
            <p role="alert" className="text-center text-sm text-brand-600">{googleError}</p>
          ) : null}
        </div>
      ) : null}

      {!googleIsConfigured && !PASSWORD_AUTH_ENABLED ? (
        <p className="rounded-xl bg-paper p-3 text-center text-sm text-ink-soft">
          Sign-in is not configured on this server yet.
        </p>
      ) : null}

      {googleIsConfigured && PASSWORD_AUTH_ENABLED ? (
        <div className="my-5 flex items-center gap-3 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
          <span className="h-px flex-1 bg-line" /> or use a password <span className="h-px flex-1 bg-line" />
        </div>
      ) : null}

      {PASSWORD_AUTH_ENABLED ? (
        <>
          <div className="mb-5 grid grid-cols-2 rounded-xl border border-line/70 bg-paper p-1 text-sm font-semibold">
            {(["login", "signup"] as const).map((modeOption) => (
              <button
                key={modeOption}
                type="button"
                aria-pressed={login.mode === modeOption}
                onClick={() => login.switchMode(modeOption)}
                className={`rounded-lg py-2.5 transition-all ${
                  login.mode === modeOption
                    ? "bg-card text-brand-700 shadow-sm"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {modeOption === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              login.submit();
            }}
          >
            {login.mode === "signup" ? (
              <label className="block text-sm font-semibold" htmlFor="login-name">
                Your name
                <input
                  id="login-name"
                  className={`${LOGIN_INPUT_CLASS} mt-2 font-normal`}
                  placeholder="How friends know you"
                  value={login.name}
                  onChange={(event) => login.setName(event.target.value)}
                  autoComplete="name"
                  required
                />
              </label>
            ) : null}

            <label className="block text-sm font-semibold" htmlFor="login-identifier">
              Email or phone
              <input
                id="login-identifier"
                className={`${LOGIN_INPUT_CLASS} mt-2 font-normal`}
                type="text"
                placeholder="you@example.com"
                value={login.identifier}
                onChange={(event) => login.setIdentifier(event.target.value)}
                autoComplete="username"
                required
              />
            </label>

            <label className="block text-sm font-semibold" htmlFor="login-password">
              Password
              <input
                id="login-password"
                className={`${LOGIN_INPUT_CLASS} mt-2 font-normal`}
                type="password"
                placeholder="At least 6 characters"
                value={login.password}
                onChange={(event) => login.setPassword(event.target.value)}
                autoComplete={login.mode === "login" ? "current-password" : "new-password"}
                required
                minLength={6}
              />
            </label>

            {login.error ? (
              <p role="alert" className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">
                {login.error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={login.isPending}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 font-semibold text-white shadow-[0_8px_24px_rgba(176,58,37,0.22)] transition-[background-color,transform,box-shadow] hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-[0_12px_28px_rgba(176,58,37,0.28)] disabled:translate-y-0 disabled:opacity-50"
            >
              {login.isPending
                ? "One moment…"
                : login.mode === "login"
                  ? "Open my ledger"
                  : "Create my ledger"}
              {!login.isPending ? (
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              ) : null}
            </button>
          </form>

          {login.mode === "signup" ? (
            <p className="mt-4 text-xs leading-relaxed text-ink-soft">
              Invited by a friend? Use the same email or phone and your shared expenses will already be here.
            </p>
          ) : null}
        </>
      ) : null}

      <p className="mt-5 flex items-center justify-center gap-2 border-t border-line pt-4 text-[11px] text-ink-soft">
        <LockKeyhole className="h-3.5 w-3.5 shrink-0" /> We read the receipt, make the split, then forget the photo. No storage, no AI training.
      </p>
      </aside>
    </>
  );
}
