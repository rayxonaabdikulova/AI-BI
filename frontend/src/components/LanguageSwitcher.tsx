"use client";

import { useLanguage } from "@/i18n/LanguageContext";

export function LanguageSwitcher() {
  const { t, language, setLanguage } = useLanguage();
  const activeLanguage = language === "uz" || language === "ru" || language === "en" ? language : "en";
  const languageOptions: Array<{ value: "uz" | "ru" | "en"; label: string }> = [
    { value: "uz", label: "UZ" },
    { value: "ru", label: "RU" },
    { value: "en", label: "EN" },
  ];

  return (
    <div className="pl-1 sm:pl-2">
      <select
        value={activeLanguage}
        aria-label={t("lang.switch")}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "en" || v === "ru" || v === "uz") {
            setLanguage(v);
          }
        }}
        title={activeLanguage.toUpperCase()}
        className="h-9 cursor-pointer rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-sm font-semibold uppercase tracking-wide text-white shadow-sm outline-none hover:bg-gray-700 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:bg-zinc-800"
      >
        {languageOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
