"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LogOut } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";

export function AppChrome({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();
  const { token, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    const confirmed = window.confirm(t("nav.logoutConfirm"));
    if (!confirmed) return;
    logout();
    // Defensive cleanup for any browser-stored auth artifacts.
    localStorage.removeItem("ai-bi-token");
    sessionStorage.removeItem("ai-bi-token");
    router.push("/login");
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/85 backdrop-blur-md pointer-events-auto dark:border-zinc-800/80 dark:bg-zinc-950/85">
        <nav
          className="relative z-50 mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 pointer-events-auto"
          aria-label={t("nav.aria")}
        >
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-zinc-900 text-xs font-bold text-white dark:bg-white dark:text-zinc-900">
              AI
            </span>
            <span>{t("nav.brand")}</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/"
              className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              {t("nav.home")}
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              <LayoutDashboard className="size-4" aria-hidden />
              {t("nav.dashboard")}
            </Link>

            <ThemeToggle />
            <LanguageSwitcher />
            {token ? (
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <LogOut className="size-4" aria-hidden />
                <span className="hidden sm:inline">{t("nav.logout")}</span>
              </button>
            ) : null}
          </div>
        </nav>
      </header>
      <div className="relative z-0 flex min-h-0 flex-1 flex-col">{children}</div>
    </>
  );
}
