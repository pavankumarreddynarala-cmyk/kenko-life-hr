"use client";

import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState } from "react";
import { tokenFromScan } from "@/lib/scan-token";

type ScanData = {
  viewer: "FULL" | "LIMITED";
  updatedAt: string;
  status?: string;
  groups: { id: string; title: string; fields: { label: string; value: string | null }[] }[];
  custodian: { code: string | null; name: string | null; type: string; department?: string | null; since: string } | null;
};

type Phase = "starting" | "scanning" | "loading" | "result" | "error";

function cameraMessage(error: unknown) {
  const name = (error as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera permission was denied. Allow camera access for this site in your browser settings, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device.";
  if (name === "NotReadableError") return "The camera is being used by another app. Close it and try again.";
  return "The camera could not be started.";
}

/** Small QR icon button that opens the full-screen scanner. Used by admins and employees. */
export function ScanQrButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        aria-label="Scan asset QR code"
        title="Scan QR"
        className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border border-stone-300 bg-white text-kenko-ink hover:bg-stone-50 ${className}`}
        onClick={() => setOpen(true)}
      >
        <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
          <rect x="8" y="8" width="3" height="3" /><rect x="13" y="8" width="3" height="3" /><rect x="8" y="13" width="3" height="3" /><path d="M13 13h3v3" />
        </svg>
      </button>
      {open && <QrScannerModal onClose={() => setOpen(false)} />}
    </>
  );
}

function QrScannerModal({ onClose }: { onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const live = useRef(true);
  const [phase, setPhase] = useState<Phase>("starting");
  const [message, setMessage] = useState("");
  const [data, setData] = useState<ScanData | null>(null);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  const lookup = useCallback(async (raw: string) => {
    const token = tokenFromScan(raw);
    if (!token) {
      setMessage("This QR code is not a Kenko asset code.");
      setPhase("error");
      return;
    }
    setPhase("loading");
    try {
      // Always the live record: no-store on both sides, so a change made to the asset shows on the next scan.
      const response = await fetch(`/api/qr-scan/${token}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(response.status === 404 ? "No asset was found for this QR code. It may have been removed." : response.status === 401 ? "Your session has expired. Sign in again to scan." : body.error ?? "Could not load the asset.");
        setPhase("error");
        return;
      }
      setData(body.data);
      setPhase("result");
    } catch {
      setMessage("Network problem. Check your connection and scan again.");
      setPhase("error");
    }
  }, []);

  const start = useCallback(async () => {
    setPhase("starting");
    setMessage("");
    setData(null);
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setMessage("Camera scanning needs a secure (HTTPS) connection. Open the portal using its https:// address.");
      setPhase("error");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("This browser cannot access the camera. Try the latest Chrome (Android) or Safari (iPhone).");
      setPhase("error");
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (!live.current) return media.getTracks().forEach((t) => t.stop());
      stream.current = media;
      const el = video.current!;
      el.srcObject = media;
      el.setAttribute("playsinline", "true"); // iPhone Safari needs this to play inline
      await el.play();
      setPhase("scanning");
      let last = 0;
      const tick = (time: number) => {
        raf.current = requestAnimationFrame(tick);
        if (time - last < 120 || el.readyState < 2 || !el.videoWidth) return;
        last = time;
        const c = canvas.current!;
        const scale = Math.min(1, 640 / el.videoWidth);
        c.width = Math.round(el.videoWidth * scale);
        c.height = Math.round(el.videoHeight * scale);
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(el, 0, 0, c.width, c.height);
        const image = ctx.getImageData(0, 0, c.width, c.height);
        const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
        if (code?.data) {
          stop();
          void lookup(code.data);
        }
      };
      raf.current = requestAnimationFrame(tick);
    } catch (error) {
      setMessage(cameraMessage(error));
      setPhase("error");
    }
  }, [lookup, stop]);

  useEffect(() => {
    live.current = true;
    void start();
    return () => {
      live.current = false;
      stop();
    };
  }, [start, stop]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/70 sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Scan asset QR code">
      <div className="flex h-full w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-bold">Scan asset QR</h2>
          <button className="rounded-lg px-3 py-1 text-sm hover:bg-stone-100" onClick={() => { stop(); onClose(); }}>Close</button>
        </div>
        <div className="overflow-y-auto p-4">
          <div className={phase === "starting" || phase === "scanning" ? "" : "hidden"}>
            <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-xl bg-black">
              <video ref={video} className="h-full w-full object-cover" muted playsInline />
              <div className="pointer-events-none absolute inset-[18%] rounded-xl border-2 border-white/80" />
            </div>
            <canvas ref={canvas} className="hidden" />
            <p className="mt-3 text-center text-sm text-stone-600" aria-live="polite">{phase === "starting" ? "Starting camera…" : "Point the camera at the asset’s QR code."}</p>
          </div>
          {phase === "loading" && <p className="py-10 text-center text-sm text-stone-600">Loading asset…</p>}
          {phase === "error" && (
            <div className="py-6 text-center">
              <p className="mx-auto max-w-sm rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{message}</p>
              <button className="btn-primary mt-4" onClick={() => void start()}>Try again</button>
            </div>
          )}
          {phase === "result" && data && (
            <div>
              <p className="mb-3 text-xs text-stone-500">Live record, last updated {new Date(data.updatedAt).toLocaleString("en-IN")}{data.status ? ` · ${data.status}` : ""}</p>
              {data.groups.map((group) => (
                <section className="mb-4" key={group.id}>
                  <h3 className="mb-2 text-sm font-bold text-kenko-green">{group.title}</h3>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    {group.fields.map((field) => (
                      <div className="rounded-lg bg-stone-50 p-2.5" key={field.label}>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{field.label}</dt>
                        <dd className="mt-0.5 break-words text-sm font-medium">{field.value ?? "—"}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
              <section className="mb-4">
                <h3 className="mb-2 text-sm font-bold text-kenko-green">Custodian · whose asset it is</h3>
                {data.custodian ? (
                  <dl className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg bg-stone-50 p-2.5"><dt className="text-[11px] font-semibold uppercase text-stone-500">Name</dt><dd className="mt-0.5 text-sm font-medium">{data.custodian.name ?? "—"}</dd></div>
                    <div className="rounded-lg bg-stone-50 p-2.5"><dt className="text-[11px] font-semibold uppercase text-stone-500">Employee code</dt><dd className="mt-0.5 text-sm font-medium">{data.custodian.code ?? data.custodian.type}</dd></div>
                    {data.custodian.department !== undefined && <div className="rounded-lg bg-stone-50 p-2.5"><dt className="text-[11px] font-semibold uppercase text-stone-500">Department</dt><dd className="mt-0.5 text-sm font-medium">{data.custodian.department ?? "—"}</dd></div>}
                    <div className="rounded-lg bg-stone-50 p-2.5"><dt className="text-[11px] font-semibold uppercase text-stone-500">Held since</dt><dd className="mt-0.5 text-sm font-medium">{data.custodian.since}</dd></div>
                  </dl>
                ) : (
                  <p className="rounded-lg bg-stone-50 p-3 text-sm text-stone-600">Not assigned to anyone.</p>
                )}
              </section>
              <button className="btn-primary w-full" onClick={() => void start()}>Scan another</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
