"use client";
/** Combined HaalKhata marketing page and login/signup experience. */

import { useState, type ReactNode } from "react";
import Image from "next/image";
import {
  ArrowRight,
  Camera,
  Check,
  CircleDollarSign,
  LockKeyhole,
  ReceiptText,
  ScanLine,
  Sparkles,
  Split,
  UsersRound,
  X,
} from "lucide-react";
import { useLogin } from "./hooks/useLogin";
import { useGoogleSignIn } from "./hooks/useGoogleSignIn";
import {
  LOGIN_INPUT_CLASS,
  SAMPLE_EXPENSES,
  SAMPLE_PARTICIPANTS,
} from "./LoginPage.constants";
import styles from "./LoginPage.module.css";
import { PASSWORD_AUTH_ENABLED } from "@/app/login/constants/googleSignIn";

/**
 * Renders the animated product preview that explains HaalKhata at a glance.
 *
 * @returns A sample weekend ledger with receipt scanning and a resolved balance.
 */
function LedgerPreview() {
  return (
    <section
      aria-label="A sample shared-expense ledger"
      className={`${styles.ledger} relative min-h-[330px] overflow-hidden rounded-[1.75rem] border border-line bg-card p-5 sm:p-6`}
    >
      <div className="relative z-10 flex items-start justify-between gap-4 pr-0 sm:pr-44">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] text-brand-600 uppercase">
            <span className="h-2 w-2 rounded-full bg-brand-500" /> Trip math, tamed
          </div>
          <h2 className="text-2xl font-bold">Trip to Yosemite</h2>
          <p className="mt-1 text-sm text-ink-soft">4 friends · one shared ledger</p>
        </div>
        <div className="flex -space-x-2" aria-label="Oni, Dot, PZ and Jess">
          {SAMPLE_PARTICIPANTS.map((participant) => (
            <span
              key={participant.initials}
              className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-card text-[10px] font-bold ${participant.colorClass}`}
            >
              {participant.initials}
            </span>
          ))}
        </div>
      </div>

      <div
        className={`${styles.receipt} absolute top-5 right-5 z-20 w-36 overflow-hidden rounded-md border border-line bg-white px-4 py-3`}
        aria-label="A receipt being scanned"
      >
        <div className="flex items-center justify-between border-b border-dashed border-line pb-2">
          <ReceiptText className="h-4 w-4 text-brand-600" />
          <span className="text-[8px] font-bold tracking-[0.16em] text-ink-soft">RECEIPT</span>
        </div>
        <div className="mt-2 space-y-1.5 text-[8px] text-ink-soft">
          <div className="flex justify-between"><span>Trail snacks</span><span>$24.00</span></div>
          <div className="flex justify-between"><span>Picnic supplies</span><span>$52.00</span></div>
          <div className="flex justify-between"><span>Firewood</span><span>$32.00</span></div>
          <div className="flex justify-between"><span>tax</span><span>$12.00</span></div>
          <div className="mt-2 flex justify-between border-t border-line pt-1.5 font-bold text-ink">
            <span>total</span><span>$120.00</span>
          </div>
        </div>
        <span
          className={`${styles.stamp} mt-2 block rounded border border-brand-500 px-1.5 py-1 text-center text-[7px] font-black tracking-[0.12em] text-brand-600`}
        >
          3 ITEMS FOUND
        </span>
      </div>

      <div className={`${styles.expenseList} relative z-10 mt-7 space-y-2`}>
        {SAMPLE_EXPENSES.map((expense) => (
          <div
            key={expense.title}
            className={`${styles.expenseRow} ${styles[expense.delayClass]} flex items-center gap-3 rounded-xl border border-line/80 bg-card/90 px-3 py-2.5 backdrop-blur-sm`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <CircleDollarSign className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{expense.title}</span>
              <span className="block text-xs text-ink-soft">{expense.payer}</span>
            </span>
            <span className="text-sm font-bold">{expense.amount}</span>
          </div>
        ))}
      </div>

      <div className="relative z-10 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className="flex items-center gap-2 text-xs font-medium text-ink-soft">
          <Check className="h-4 w-4 text-pos-600" /> Split exactly to the cent
        </span>
        <span className={`${styles.balanceGlow} rounded-full bg-pos-50 px-3 py-1.5 text-sm font-bold text-pos-700`}>
          Oni gets back $15.00
        </span>
      </div>
    </section>
  );
}

/**
 * Renders the credential and Google sign-in controls without changing the
 * existing authentication behavior.
 *
 * @param props - Mobile visibility state and close action.
 * @returns The desktop auth card or mobile sign-in sheet.
 */
function AuthPanel({
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

/**
 * Renders a product promise in the concise three-step explainer.
 *
 * @param props - Step number, icon, title and supporting detail.
 * @returns One product-explanation row.
 */
function ProductStep({
  number,
  icon,
  title,
  detail,
}: {
  number: string;
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <article className="group border-t border-line py-5 sm:py-6">
      <div className="flex items-start gap-4">
        <span className="mt-1 text-xs font-bold tracking-[0.16em] text-brand-600">{number}</span>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-card text-brand-600 transition-transform group-hover:-rotate-3 group-hover:scale-105">
          {icon}
        </span>
        <div>
          <h3 className="text-xl font-bold">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-ink-soft">{detail}</p>
        </div>
      </div>
    </article>
  );
}

/**
 * Renders the combined landing page and authentication entry point.
 *
 * @returns The marketing story, live product preview, and auth controls.
 */
export function LoginPage() {
  const [mobileAuthOpen, setMobileAuthOpen] = useState(false);

  return (
    <main className={`${styles.page} relative min-h-dvh`}>
      <header className="sticky top-0 z-30 mx-auto flex max-w-[1480px] items-center justify-between gap-4 border-b border-line/70 bg-paper/90 px-5 py-4 backdrop-blur-md sm:px-8 lg:static lg:border-b-0 lg:bg-transparent lg:px-12 lg:py-5 lg:backdrop-blur-none">
        <div className="flex items-center gap-3">
          <Image
            src="/icon-192.png"
            alt=""
            aria-hidden="true"
            className="h-10 w-10 rounded-lg"
            height={40}
            priority
            width={40}
          />
          <span>
            <span className="block font-display text-xl font-bold leading-none">HaalKhata</span>
            <span className="mt-1 block text-[9px] font-bold tracking-[0.18em] text-ink-soft uppercase">
              The shared-expense ledger
            </span>
          </span>
        </div>
        <button
          type="button"
          aria-controls="sign-in"
          aria-expanded={mobileAuthOpen}
          onClick={() => setMobileAuthOpen(true)}
          className="rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm lg:hidden"
        >
          Sign in
        </button>
      </header>

      <div className={`${styles.heroGrid} mx-auto grid max-w-[1480px] gap-8 px-5 pb-16 sm:px-8 lg:gap-x-14 lg:px-12 lg:pb-20 xl:gap-x-20`}>
        <section className={`${styles.story} max-w-3xl pt-6 lg:pt-12`}>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50/80 px-3 py-1.5 text-xs font-bold tracking-wide text-brand-700 uppercase">
            <Sparkles className="h-3.5 w-3.5" /> Shared expenses, minus the spreadsheet
          </p>
          <h1 className={`${styles.heroTitle} max-w-3xl leading-[0.88] font-bold tracking-[-0.045em] text-ink`}>
            Stop being the<br />
            <span className="text-brand-600">group accountant.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-ink-soft sm:text-xl">
            HaalKhata turns receipts, group expenses, and those “wait, who paid?” moments into one calm ledger, itemized, exact, and easy to settle.
          </p>
          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold text-ink">
            <span className="flex items-center gap-2"><ScanLine className="h-4 w-4 text-brand-600" /> Scan receipts</span>
            <span className="flex items-center gap-2"><Split className="h-4 w-4 text-brand-600" /> Split by item</span>
            <span className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-brand-600" /> Settle without guessing</span>
          </div>
        </section>

        <AuthPanel
          mobileOpen={mobileAuthOpen}
          onMobileClose={() => setMobileAuthOpen(false)}
        />

        <div className="pt-2 lg:pt-5">
          <LedgerPreview />
        </div>
      </div>

      <section id="how-it-works" className="border-y border-line bg-card/55">
        <div className="mx-auto max-w-[1480px] px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.4fr] lg:gap-20">
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-brand-600 uppercase">What to expect</p>
              <h2 className="mt-3 max-w-md text-4xl font-bold leading-tight sm:text-5xl">
                From camera roll to clean slate.
              </h2>
              <p className="mt-4 max-w-md leading-7 text-ink-soft">
                Built for dinner tables, shared homes, and trips where nobody wants to become the group accountant.
              </p>
            </div>
            <div className="grid gap-x-8 md:grid-cols-3">
              <ProductStep
                number="01"
                icon={<Camera className="h-5 w-5" />}
                title="Snap it"
                detail="Photograph a receipt and let AI pull out items, tax, tip, and total."
              />
              <ProductStep
                number="02"
                icon={<Split className="h-5 w-5" />}
                title="Split it"
                detail="Divide equally, by shares, by percentage, or assign every item to the right people."
              />
              <ProductStep
                number="03"
                icon={<Check className="h-5 w-5" />}
                title="Clear it"
                detail="See who owes what, open their preferred payment app or copy their saved handle, then record the settlement."
              />
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-4 px-5 py-7 text-xs text-ink-soft sm:px-8 lg:px-12">
        <span>HaalKhata · A fresh ledger for shared lives.</span>
        <span className="flex items-center gap-2"><LockKeyhole className="h-3.5 w-3.5" /> Receipt photos are not retained or used for AI training</span>
      </footer>
    </main>
  );
}
