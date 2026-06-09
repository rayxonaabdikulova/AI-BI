"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, Sparkles } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";

export default function Home() {
  const { t } = useLanguage();

  return (
    <div className="flex flex-1 flex-col">
      <section className="relative isolate z-0 flex flex-1 items-center overflow-hidden px-4 py-20 sm:px-6 sm:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-100/80 via-white to-white dark:from-sky-950/40 dark:via-zinc-950 dark:to-zinc-950"
        />
        <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-white/70 px-3 py-1 text-xs font-medium text-sky-800 shadow-sm backdrop-blur dark:border-sky-800/60 dark:bg-zinc-900/70 dark:text-sky-200">
            <Sparkles className="size-3.5" aria-hidden />
            {t("heroBadge")}
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl dark:text-zinc-50">
            {t("heroTitle")}
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
            {t("heroSubtitle")}
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {t("goDashboard")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-500">
              {t("platformSublead")}
            </p>
          </div>
          <div className="mt-16 grid w-full gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-200/80 bg-white/60 p-4 text-left shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/40">
              <BarChart3 className="mb-2 size-5 text-sky-600 dark:text-sky-400" aria-hidden />
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {t("feature1Title")}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                {t("feature1Body")}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200/80 bg-white/60 p-4 text-left shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/40">
              <Sparkles className="mb-2 size-5 text-violet-600 dark:text-violet-400" aria-hidden />
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {t("feature2Title")}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                {t("feature2Body")}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200/80 bg-white/60 p-4 text-left shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/40 sm:col-span-1">
              <BarChart3 className="mb-2 size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {t("feature3Title")}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                {t("feature3Body")}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
