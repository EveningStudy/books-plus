import { t, useLocale } from "../i18n";
import { useEffect, useRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { X } from "lucide-react";
import { LanguageSwitcher } from "./LanguageSwitcher";
export function IconButton({
  label,
  children,
  active,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  active?: boolean;
}) {
  useLocale();
  return (
    <button
      className={"icon-button" + (active ? " active" : "")}
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
}
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  useLocale();
  return (
    <button
      type="button"
      className={"switch" + (checked ? " on" : "")}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
export function Range({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = "",
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
  disabled?: boolean;
}) {
  useLocale();
  return (
    <label className={"setting-row range-row" + (disabled ? " disabled" : "")}>
      <span>{label}</span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
      />
      <output>
        {Number(value.toFixed(2))}
        {suffix}
      </output>
    </label>
  );
}
export function Dialog({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useLocale();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    ref.current?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const all = [
          ...(ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select,textarea,[tabindex="0"]',
          ) || []),
        ];
        if (!all.length) return;
        if (
          event.shiftKey &&
          (document.activeElement === all[0] ||
            document.activeElement === ref.current)
        ) {
          event.preventDefault();
          all[all.length - 1].focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === all[all.length - 1]
        ) {
          event.preventDefault();
          all[0].focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      before?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={"dialog" + (wide ? " wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header>
          <h2>{title}</h2>
          <LanguageSwitcher />
          <IconButton label={t("关闭设置")} onClick={onClose}>
            <X />
          </IconButton>
        </header>
        {children}
      </div>
    </div>
  );
}
