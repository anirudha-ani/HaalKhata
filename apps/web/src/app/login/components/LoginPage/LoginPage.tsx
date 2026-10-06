"use client";
/** Combined HaalKhata marketing page and login/signup experience. */

import { useState } from "react";
import Image from "next/image";
import { Camera, Check, LockKeyhole, ScanLine, Sparkles, Split, UsersRound } from "lucide-react";
import styles from "./LoginPage.module.css";
import { LedgerPreview } from "./components/LedgerPreview/LedgerPreview";
import { AuthPanel } from "./components/AuthPanel/AuthPanel";
import { ProductStep } from "./components/ProductStep/ProductStep";

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
