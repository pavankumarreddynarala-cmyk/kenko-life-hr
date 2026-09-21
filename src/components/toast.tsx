"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiRequestError } from "@/lib/client-api";
import { describeIssue } from "@/lib/zod-errors";

type Kind = "success" | "error" | "info";
type ToastItem = { id: number; kind: Kind; title?: string; message: string; details: string[] };
type ToastOptions = { title?: string; details?: string[] };

export type ToastApi = {
  success: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  /** Shows any thrown error — API validation errors list every field that needs attention. */
  fromError: (error: unknown, title?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const STYLES: Record<Kind, { box: string; icon: string; symbol: string }> = {
  success: { box: "border-green-200 bg-green-50 text-green-900", icon: "bg-kenko-green text-white", symbol: "✓" },
  info: { box: "border-stone-200 bg-white text-stone-800", icon: "bg-stone-700 text-white", symbol: "i" },
  error: { box: "border-red-200 bg-red-50 text-red-900", icon: "bg-red-600 text-white", symbol: "!" },
};
const DURATION: Record<Kind, number> = { success: 5000, info: 6000, error: 15000 };
const MAX_DETAILS = 6;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (kind: Kind, message: string, options: ToastOptions = {}) => {
      counter.current += 1;
      const id = counter.current;
      const details = options.details ?? [];
      setItems((current) => [
        ...current.filter((item) => !(item.kind === kind && item.message === message)).slice(-3),
        { id, kind, title: options.title, message, details },
      ]);
      timers.current.set(id, window.setTimeout(() => dismiss(id), DURATION[kind]));
    },
    [dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, options) => push("success", message, options),
      info: (message, options) => push("info", message, options),
      error: (message, options) => push("error", message, options),
      fromError: (error, title) => {
        if (error instanceof ApiRequestError && error.fields.length > 1) {
          push("error", "Please correct the following and try again.", {
            title,
            details: error.fields.map(describeIssue),
          });
          return;
        }
        const message = error instanceof Error ? error.message : "Something unexpected happened. Reload the page and try again.";
        const reference = error instanceof ApiRequestError && error.reference ? [`Reference: ${error.reference}`] : [];
        push("error", message, { title, details: reference });
      },
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 top-3 z-[100] flex flex-col items-stretch gap-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[26rem]"
      >
        {items.map((item) => {
          const style = STYLES[item.kind];
          return (
            <div
              key={item.id}
              role={item.kind === "error" ? "alert" : "status"}
              className={`pointer-events-auto flex gap-3 rounded-xl border p-3 shadow-lg ${style.box}`}
            >
              <span aria-hidden="true" className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${style.icon}`}>
                {style.symbol}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                {item.title && <p className="font-semibold">{item.title}</p>}
                <p className="break-words">{item.message}</p>
                {item.details.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
                    {item.details.slice(0, MAX_DETAILS).map((detail) => (
                      <li className="break-words" key={detail}>{detail}</li>
                    ))}
                    {item.details.length > MAX_DETAILS && <li>…and {item.details.length - MAX_DETAILS} more</li>}
                  </ul>
                )}
              </div>
              <button aria-label="Dismiss notification" className="h-6 w-6 shrink-0 rounded text-lg leading-none opacity-60 hover:opacity-100" onClick={() => dismiss(item.id)}>
                ×
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside <ToastProvider>");
  return value;
}
