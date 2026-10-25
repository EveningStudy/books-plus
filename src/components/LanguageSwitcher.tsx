import { useState } from "react";
import { setLocale, t, useLocale } from "../i18n";
export function LanguageSwitcher() {
  const language = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="language-control">
      <div
        className="language-switcher"
        role="group"
        aria-label={t("界面语言")}
      >
        {(["zh", "en"] as const).map((locale) => (
          <button
            key={locale}
            type="button"
            aria-pressed={language === locale}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await setLocale(locale);
              } catch {
                setError(t("语言设置未能保存，请重试"));
              } finally {
                setBusy(false);
              }
            }}
          >
            {locale === "zh" ? "中文" : "EN"}
          </button>
        ))}
      </div>
      {error ? (
        <small className="language-error" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}
