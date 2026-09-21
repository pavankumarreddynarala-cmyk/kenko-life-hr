"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requestJson } from "@/lib/client-api";
import { Modal } from "@/components/form";

// Automatic sign-out after 5 minutes without activity, with a warning during the last
// minute. The server enforces the same limit independently: its session cookie is only
// renewed by the heartbeat below, which is sent while the user is active.
const IDLE_MS = 5 * 60 * 1000;
const WARN_MS = 60 * 1000;
const HEARTBEAT_MS = 30 * 1000;
const ACTIVITY_KEY = "kenko:last-activity";
export const LOGOUT_KEY = "kenko:logout";

function storedActivity(): number {
  try {
    return Number(window.localStorage.getItem(ACTIVITY_KEY)) || 0;
  } catch {
    return 0;
  }
}

function rememberActivity(at: number) {
  try {
    window.localStorage.setItem(ACTIVITY_KEY, String(at));
  } catch {
    // Storage can be blocked (private mode); the per-tab timer still works.
  }
}

export function IdleTimeout({ onTimeout }: { onTimeout: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastActivity = useRef(Date.now());
  const lastHeartbeat = useRef(Date.now());
  const warning = useRef(false);
  const fired = useRef(false);

  const heartbeat = useCallback(() => {
    lastHeartbeat.current = Date.now();
    requestJson("/api/auth/session", { method: "POST" }).catch(() => {
      // A 401 is announced by requestJson itself; other failures retry on the next activity.
    });
  }, []);

  const markActive = useCallback(
    (force = false) => {
      // While the warning is showing only the "Stay signed in" button counts as activity,
      // so a stray mouse movement does not silently dismiss it.
      if (warning.current && !force) return;
      const now = Date.now();
      lastActivity.current = now;
      rememberActivity(now);
      if (force || now - lastHeartbeat.current > HEARTBEAT_MS) heartbeat();
    },
    [heartbeat],
  );

  useEffect(() => {
    rememberActivity(Date.now());
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"] as const;
    const handler = () => markActive();
    events.forEach((name) => window.addEventListener(name, handler, { passive: true, capture: true }));

    const tick = window.setInterval(() => {
      // Another tab may have seen activity more recently than this one.
      const idle = Date.now() - Math.max(lastActivity.current, storedActivity());
      if (idle >= IDLE_MS) {
        if (!fired.current) {
          fired.current = true;
          onTimeout();
        }
        return;
      }
      if (idle >= IDLE_MS - WARN_MS) {
        warning.current = true;
        setSecondsLeft(Math.max(1, Math.ceil((IDLE_MS - idle) / 1000)));
      } else {
        warning.current = false;
        setSecondsLeft(null);
      }
    }, 1000);

    return () => {
      events.forEach((name) => window.removeEventListener(name, handler, { capture: true }));
      window.clearInterval(tick);
    };
  }, [markActive, onTimeout]);

  if (secondsLeft === null) return null;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <Modal
      title="Are you still there?"
      onClose={() => markActive(true)}
      size="max-w-md"
      footer={
        <>
          <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={onTimeout}>Sign out now</button>
          <button className="btn-primary" autoFocus onClick={() => markActive(true)}>Stay signed in</button>
        </>
      }
    >
      <p className="text-sm text-stone-700">
        Your session is about to expire due to inactivity. Please continue your session to remain logged in.
      </p>
      <p className="mt-3 text-center text-3xl font-bold tabular-nums text-kenko-orange" aria-live="polite">
        {minutes}:{seconds}
      </p>
      <p className="mt-1 text-center text-xs text-stone-500">You will be signed out automatically when the timer reaches zero.</p>
    </Modal>
  );
}
