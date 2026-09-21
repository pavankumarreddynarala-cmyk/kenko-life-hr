"use client";

import { ReactNode, useEffect, useState } from "react";

export function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 font-bold text-red-600">*</span>
      <span className="sr-only"> (required)</span>
    </>
  );
}

/** Input class that turns the border red when the field has an error. */
export function inputClass(hasError?: boolean, extra = "") {
  return `input mt-1 ${hasError ? "border-red-500 focus:border-red-500 focus:ring-red-100" : ""} ${extra}`.trim();
}

/**
 * A labelled form control. Mandatory fields get a red star next to the label; an error
 * (from the client-side required check or from the server) shows underneath the control.
 */
export function Field({
  label,
  required,
  error,
  hint,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span>
        {label}
        {required && <RequiredMark />}
      </span>
      {children}
      {error ? (
        <span role="alert" className="mt-1 block text-xs font-medium text-red-700">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-stone-500">{hint}</span>
      ) : null}
    </label>
  );
}

export function RequiredLegend() {
  return (
    <p className="text-xs text-stone-500">
      Fields marked <span className="font-bold text-red-600">*</span> are mandatory.
    </p>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = "max-w-5xl",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <section className={`mx-auto my-4 w-full rounded-2xl bg-white p-4 shadow-xl sm:my-8 sm:p-6 ${size}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold sm:text-xl">{title}</h3>
            {subtitle && <p className="mt-0.5 break-words text-sm text-stone-500">{subtitle}</p>}
          </div>
          <button aria-label="Close" className="-mr-1 h-8 w-8 shrink-0 rounded-lg text-2xl leading-none text-stone-500 hover:bg-stone-100" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="mt-4">{children}</div>
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-3">{footer}</div>}
      </section>
    </div>
  );
}

/**
 * Confirmation before a destructive action. With `reasonLabel` it also collects a
 * mandatory reason (shown with a red star) and refuses to continue until one is typed.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busyLabel,
  busy,
  tone = "danger",
  reasonLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  tone?: "danger" | "primary";
  reasonLabel?: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  function confirm() {
    if (reasonLabel && reason.trim().length < 3) {
      setError(`${reasonLabel} is required. Enter at least 3 characters explaining why.`);
      return;
    }
    setError("");
    onConfirm(reason.trim());
  }

  return (
    <Modal
      title={title}
      onClose={busy ? () => undefined : onCancel}
      size="max-w-md"
      footer={
        <>
          <button className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
          <button
            className={`btn text-white disabled:opacity-60 ${tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-kenko-orange hover:bg-orange-700"}`}
            disabled={busy}
            onClick={confirm}
          >
            {busy ? busyLabel ?? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-stone-600">{children}</div>
      {reasonLabel && (
        <Field label={reasonLabel} required error={error} className="mt-4">
          <textarea
            className={inputClass(Boolean(error))}
            rows={3}
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder="For example: created by mistake, duplicate entry, wrong serial number"
          />
        </Field>
      )}
    </Modal>
  );
}
