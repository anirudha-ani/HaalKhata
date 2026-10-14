"use client";
/** Auth panel: configured identity providers and local credentials in a card or sheet. */

import { LegalLinks } from "@/components/legal/LegalLinks/LegalLinks";
import { APPLE_SIGN_IN_UNAVAILABLE } from "@haalkhata/shared/auth/providerMessages";
import { useAppleSignIn } from "../../hooks/useAppleSignIn";
import { ArrowRight, X } from "lucide-react";
import { GoogleSignIn } from "./components/GoogleSignIn/GoogleSignIn";
import { useLogin } from "../../hooks/useLogin";
import { LOGIN_INPUT_CLASS } from "../../constants/loginPage";
import styles from "../../LoginPage.module.css";
import { GOOGLE_CLIENT_ID, PASSWORD_AUTH_ENABLED } from "@/app/login/constants/googleSignIn";

/**
 * Renders configured Google/Apple sign-in and local development credentials.
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
  const apple = useAppleSignIn();
  const googleIsConfigured = GOOGLE_CLIENT_ID.length > 0;
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
        className={`${styles.authPanel} mx-auto w-auto max-w-[440px] scroll-mt-6 self-start rounded-3xl border border-line bg-card p-6 shadow-xl shadow-ink/5 sm:p-7 lg:sticky lg:inset-auto lg:top-6 lg:z-auto lg:row-span-2 lg:block lg:max-h-none lg:w-full lg:overflow-visible ${
          mobileOpen
            ? "fixed inset-x-3 bottom-3 z-50 block max-h-[calc(100dvh-1.5rem)] overflow-y-auto sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 lg:translate-y-0"
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
      <div className="mb-6 pr-10 lg:pr-0">
          <h2 className="text-[28px] leading-tight font-bold tracking-tight">
            {isSigningIn ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mt-2 text-sm leading-5 text-ink-soft">
            {isSigningIn
              ? "Sign in to your shared ledger."
              : "A fresh start for your shared expenses."}
          </p>
      </div>

      <div className="space-y-3">
      {apple.available ? <button type="button" disabled={apple.isPending} onClick={apple.signIn}
        className="w-full rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
        {apple.isPending ? "Signing in…" : "Continue with Apple"}
      </button> : !apple.isLoading ? (
        <p role="status" className="rounded-lg border border-line bg-paper px-3 py-2.5 text-xs leading-5 text-ink-soft">
          {APPLE_SIGN_IN_UNAVAILABLE}
        </p>
      ) : null}
      {apple.error ? <p role="alert" className="mb-3 text-sm text-brand-600">{apple.error}</p> : null}

      {googleIsConfigured ? <GoogleSignIn /> : null}
      </div>

      {(googleIsConfigured || apple.available) && PASSWORD_AUTH_ENABLED ? (
        <div className="my-5 flex items-center gap-3 text-xs text-ink-soft">
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
                placeholder={isSigningIn ? "Enter your password" : "At least 6 characters"}
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
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {login.isPending
                ? "One moment…"
                : login.mode === "login"
                  ? "Sign in"
                  : "Create account"}
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

      <footer className="mt-5 border-t border-line pt-2">
        <LegalLinks />
      </footer>
      </aside>
    </>
  );
}
