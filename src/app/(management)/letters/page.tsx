"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilterableTable, TableColumn } from "@/components/filterable-table";
import { ConfirmDialog, Field, inputClass } from "@/components/form";
import { useSessionUser } from "@/components/session-context";
import { useToast } from "@/components/toast";
import { ApiRequestError, fieldErrorMap, jsonBody, requestJson } from "@/lib/client-api";
import { fieldLabel, isLongField, LETTER_TYPES, letterTypeLabel } from "@/lib/letter-fields";

type Template = { id: string; name: string; letterType: string; fileName: string; fields: string[]; version: number; active: boolean; updatedAt: string };
type Config = { pdf: boolean; mail: boolean; replyTo: string };
type Log = { id: string; templateName: string; letterType: string; employeeCode: string | null; employeeName: string | null; action: string; sentTo: string | null; actorEmail: string; createdAt: string };
type Found = { code: string; name: string; email: string | null };

const todayLong = () => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
const ACTIONS: Record<string, string> = { DOWNLOADED_DOCX: "Downloaded (Word)", DOWNLOADED_PDF: "Downloaded (PDF)", EMAILED_PDF: "Emailed (PDF)" };

async function fetchFile(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) {
    let message = "The letter could not be prepared. Try again.";
    let code: string | undefined;
    try {
      const json = (await response.json()) as { error?: string; code?: string };
      if (json.error) message = json.error;
      code = json.code;
    } catch { /* keep the default message */ }
    throw new ApiRequestError(message, response.status, code);
  }
  return response.blob();
}

function save(blob: Blob, name: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
}

export default function LettersPage() {
  const user = useSessionUser();
  const toast = useToast();
  const canManage = user.permissions.manageDocuments;
  const canTemplates = user.permissions.manageTemplates;
  const [tab, setTab] = useState<"generate" | "templates" | "history">("generate");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [config, setConfig] = useState<Config>({ pdf: false, mail: false, replyTo: "accounts@thekenkolife.com" });
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTemplates = useCallback(async () => {
    try {
      const body = await requestJson<{ data: Template[]; config: Config }>("/api/letters/templates", { cache: "no-store" });
      setTemplates(body.data ?? []);
      setConfig(body.config);
    } catch (error) {
      toast.fromError(error, "Letter templates could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [toast]);
  const loadLogs = useCallback(async () => {
    try {
      setLogs((await requestJson<{ data: Log[] }>("/api/letters/logs", { cache: "no-store" })).data ?? []);
    } catch (error) {
      toast.fromError(error, "The letter history could not be loaded");
    }
  }, [toast]);
  useEffect(() => { if (canManage) void loadTemplates(); else setLoading(false); }, [canManage, loadTemplates]);
  useEffect(() => { if (tab === "history" && canManage) void loadLogs(); }, [tab, canManage, loadLogs]);

  if (!canManage) {
    return <p className="card text-sm">Only an Admin, CEO, COO or HR can generate letters.</p>;
  }

  return (
    <>
      <div className="mb-4">
        <h2 className="text-2xl font-bold">Document Generation</h2>
        <p className="text-sm text-stone-500">Prepare HR letters only from the approved templates. Pick a template, enter the employee ID, adjust any field, then download or email the letter.</p>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {([["generate", "Generate letter"], ["templates", "Templates"], ["history", "History"]] as const).map(([key, label]) => (
          <button key={key} className={tab === key ? "btn-primary" : "btn border border-stone-300 bg-white"} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {tab === "generate" && <Generate templates={templates.filter((t) => t.active)} config={config} loading={loading} onSent={() => void loadLogs()} />}
      {tab === "templates" && <Templates templates={templates} canUpload={canTemplates} loading={loading} onChanged={() => void loadTemplates()} />}
      {tab === "history" && <History logs={logs} />}
    </>
  );
}

function Generate({ templates, config, loading, onSent }: { templates: Template[]; config: Config; loading: boolean; onSent: () => void }) {
  const toast = useToast();
  const [templateId, setTemplateId] = useState("");
  const [lookup, setLookup] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "lookup" | "docx" | "pdf" | "send">("");
  const [confirmSend, setConfirmSend] = useState(false);
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "error">("idle");
  const [previewMessage, setPreviewMessage] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const template = templates.find((t) => t.id === templateId);

  useEffect(() => {
    if (!template) return;
    setValues((current) => Object.fromEntries(template.fields.map((f) => [f, current[f] ?? (f === "letter_date" ? todayLong() : "")])));
    // Only reset the fields when a different template is chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // Live preview: the filled Word file is rendered in the browser, so it looks exactly like the template.
  useEffect(() => {
    if (!template || !host.current) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPreviewState("loading");
      try {
        const response = await fetch("/api/letters/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId, values, format: "docx", preview: true }), signal: controller.signal });
        if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? "The preview could not be prepared.");
        const buffer = await response.arrayBuffer();
        const { renderAsync } = await import("docx-preview");
        if (controller.signal.aborted || !host.current) return;
        host.current.innerHTML = "";
        await renderAsync(buffer, host.current, undefined, { inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: false });
        const wrapper = host.current.querySelector<HTMLElement>(".docx-wrapper");
        const page = host.current.querySelector<HTMLElement>("section.docx");
        if (wrapper && page) {
          const needed = page.offsetWidth + 60;
          (wrapper.style as CSSStyleDeclaration & { zoom: string }).zoom = String(Math.min(1, host.current.clientWidth / needed));
        }
        setPreviewState("idle");
      } catch (error) {
        if (controller.signal.aborted) return;
        setPreviewMessage(error instanceof Error ? error.message : "The preview could not be prepared.");
        setPreviewState("error");
      }
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [template, templateId, values]);

  async function findEmployee() {
    setLookupError("");
    if (!lookup.trim()) return setLookupError("Enter an Employee ID (for example EMP0042) or an email address.");
    setBusy("lookup");
    try {
      const body = await requestJson<{ employee: Found; values: Record<string, string> }>(`/api/letters/employee?q=${encodeURIComponent(lookup.trim())}`, { cache: "no-store" });
      setFound(body.employee);
      setValues((current) => {
        const next = { ...current };
        for (const field of template?.fields ?? Object.keys(body.values)) if (field in body.values) next[field] = body.values[field];
        return next;
      });
      toast.success(`${body.employee.name} (${body.employee.code}) — fields filled from the Employee Master. You can still edit any of them.`, { title: "Employee found" });
    } catch (error) {
      setFound(null);
      setLookupError(fieldErrorMap(error).employee || (error instanceof Error ? error.message : "Employee not found."));
    } finally {
      setBusy("");
    }
  }

  const payload = (extra: object) => ({ templateId, values, employeeCode: found?.code, ...extra });

  async function download(format: "docx" | "pdf") {
    setBusy(format);
    try {
      const blob = await fetchFile("/api/letters/render", payload({ format }));
      save(blob, `${letterTypeLabel(template?.letterType ?? "letter").toLowerCase().replace(/\s+/g, "-")}-${found?.code ?? "draft"}.${format}`);
      toast.success(format === "pdf" ? "PDF downloaded." : "Word file downloaded.", { title: "Done" });
    } catch (error) {
      toast.fromError(error, "Download failed");
    } finally {
      setBusy("");
    }
  }

  async function send() {
    setConfirmSend(false);
    setBusy("send");
    try {
      const result = await requestJson<{ sentTo: string }>("/api/letters/send", jsonBody("POST", payload({ recipient: found?.code ?? lookup })));
      toast.success(`The letter was emailed as a PDF to ${result.sentTo}. Replies go to ${config.replyTo}.`, { title: "Sent" });
      onSent();
    } catch (error) {
      toast.fromError(error, "Letter not sent");
    } finally {
      setBusy("");
    }
  }

  if (loading) return <p className="card text-sm text-stone-600">Loading templates…</p>;
  if (templates.length === 0) return <p className="card text-sm text-stone-600">No approved letter templates are available yet. An Admin, CEO or COO uploads them under the Templates tab.</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Preview first on phones and tablets (stacked above the fields), on the left on desktop. */}
      <section className="card min-w-0 p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">Letter preview</h3>
          {previewState === "loading" && <span className="text-xs text-stone-500">Updating…</span>}
        </div>
        {!template ? (
          <p className="py-16 text-center text-sm text-stone-500">Choose a template to see the letter.</p>
        ) : (
          <>
            {previewState === "error" && <p role="alert" className="mb-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">{previewMessage}</p>}
            <div ref={host} className="max-h-[75vh] min-h-[300px] overflow-auto rounded-lg bg-stone-100" />
          </>
        )}
      </section>

      <section className="card min-w-0">
        <Field label="Template" required>
          <select className={inputClass()} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Choose a template</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{letterTypeLabel(t.letterType)} — {t.name}</option>)}
          </select>
        </Field>
        <form className="mt-3" onSubmit={(e) => { e.preventDefault(); void findEmployee(); }}>
          <Field label="Employee ID or email" error={lookupError} hint="Fills the fields from the Employee Master.">
            <div className="mt-1 flex gap-2">
              <input className={inputClass(Boolean(lookupError), "!mt-0")} value={lookup} onChange={(e) => { setLookup(e.target.value); setFound(null); }} placeholder="EMP0042" autoCapitalize="characters" />
              <button className="btn-green shrink-0 disabled:opacity-60" type="submit" disabled={busy === "lookup"}>{busy === "lookup" ? "…" : "Fill"}</button>
            </div>
          </Field>
        </form>
        {found && <p className="mt-2 rounded-lg bg-green-50 p-2 text-xs text-green-900">{found.name} · {found.code}{found.email ? ` · ${found.email}` : " · no email on file"}</p>}

        {template && (
          <div className="mt-4 space-y-3 border-t border-stone-100 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Editable fields</p>
            {template.fields.map((key) => (
              <Field key={key} label={fieldLabel(key)}>
                {isLongField(key) ? (
                  <textarea className={inputClass()} rows={3} value={values[key] ?? ""} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
                ) : (
                  <input className={inputClass()} value={values[key] ?? ""} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
                )}
              </Field>
            ))}
            <div className="flex flex-wrap gap-2 pt-2">
              <button className="btn-primary disabled:opacity-60" disabled={Boolean(busy)} onClick={() => void download("docx")}>{busy === "docx" ? "Preparing…" : "Download Word"}</button>
              <button className="btn-primary disabled:opacity-60" disabled={Boolean(busy)} onClick={() => void download("pdf")}>{busy === "pdf" ? "Preparing…" : "Download PDF"}</button>
              <button className="btn-green disabled:opacity-60" disabled={Boolean(busy) || (!found && !lookup.trim())} onClick={() => setConfirmSend(true)}>{busy === "send" ? "Sending…" : "Email PDF"}</button>
            </div>
            {(!config.pdf || !config.mail) && (
              <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                {!config.pdf && "PDF conversion is not connected yet, so PDF download and email will not work until the main administrator sets it up. Word download works now. "}
                {!config.mail && "Email sending is not connected yet."}
              </p>
            )}
            <p className="text-xs text-stone-500">Emailed letters are PDF only, and replies go to {config.replyTo}. Every download and email is logged.</p>
          </div>
        )}
      </section>

      {confirmSend && (
        <ConfirmDialog title="Email this letter?" tone="primary" confirmLabel="Send PDF" busyLabel="Sending…" onConfirm={() => void send()} onCancel={() => setConfirmSend(false)}>
          The {template ? letterTypeLabel(template.letterType).toLowerCase() : "letter"} will be converted to PDF and emailed to {found ? `${found.name} (${found.email ?? "no email on file"})` : lookup}. Replies will go to {config.replyTo}.
        </ConfirmDialog>
      )}
    </div>
  );
}

function Templates({ templates, canUpload, loading, onChanged }: { templates: Template[]; canUpload: boolean; loading: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<{ name: string; letterType: string; file: File | null }>({ name: "", letterType: "OFFER", file: null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function upload() {
    const found: Record<string, string> = {};
    if (form.name.trim().length < 2) found.name = "Enter a name for the template.";
    if (!form.file) found.file = "Choose the Word (.docx) template.";
    if (Object.keys(found).length) return setErrors(found);
    const data = new FormData();
    data.set("name", form.name);
    data.set("letterType", form.letterType);
    data.set("file", form.file!);
    setBusy(true);
    try {
      await requestJson("/api/letters/templates", { method: "POST", body: data });
      toast.success("Template uploaded. Its editable fields were detected automatically.", { title: "Saved" });
      setForm({ name: "", letterType: "OFFER", file: null });
      setErrors({});
      if (fileInput.current) fileInput.current.value = "";
      onChanged();
    } catch (error) {
      setErrors(fieldErrorMap(error));
      toast.fromError(error, "Template not saved");
    } finally {
      setBusy(false);
    }
  }

  async function patch(template: Template, change: { active?: boolean; file?: File }) {
    const data = new FormData();
    if (change.active !== undefined) data.set("active", String(change.active));
    if (change.file) data.set("file", change.file);
    try {
      await requestJson(`/api/letters/templates/${template.id}`, { method: "PATCH", body: data });
      toast.success(change.file ? "Template replaced (new version)." : change.active ? "Template switched on." : "Template switched off. It can no longer be used for letters.", { title: "Saved" });
      onChanged();
    } catch (error) {
      toast.fromError(error, "Template not changed");
    }
  }

  const columns = useMemo<TableColumn<Template>[]>(
    () => [
      { key: "name", label: "Template", render: (t) => <span className="font-medium">{t.name}</span>, filterValue: (t) => t.name },
      { key: "type", label: "Type", render: (t) => letterTypeLabel(t.letterType), filterValue: (t) => letterTypeLabel(t.letterType) },
      { key: "fields", label: "Editable fields", render: (t) => <span className="flex max-w-md flex-wrap gap-1">{t.fields.map((f) => <code key={f} className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{f}</code>)}</span>, filterValue: (t) => t.fields.join(" ") },
      { key: "version", label: "Version", render: (t) => `v${t.version}`, filterable: false },
      { key: "active", label: "Status", render: (t) => <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.active ? "bg-green-100 text-green-800" : "bg-stone-200 text-stone-600"}`}>{t.active ? "In use" : "Off"}</span>, filterValue: (t) => (t.active ? "in use" : "off") },
      {
        key: "actions",
        label: "Actions",
        filterable: false,
        render: (t) => (
          <div className="flex flex-wrap gap-2">
            { }
            <a className="rounded-md bg-stone-100 px-2 py-1" href={`/api/letters/templates/${t.id}/file`}>Download</a>
            {canUpload && (
              <>
                <label className="cursor-pointer rounded-md bg-stone-100 px-2 py-1">
                  Replace file
                  <input type="file" accept=".docx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void patch(t, { file: f }); }} />
                </label>
                <button className="rounded-md bg-stone-100 px-2 py-1" onClick={() => void patch(t, { active: !t.active })}>{t.active ? "Switch off" : "Switch on"}</button>
              </>
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers only use stable setters
    [canUpload],
  );

  return (
    <>
      {canUpload ? (
        <section className="card mb-4">
          <h3 className="text-sm font-bold">Upload an approved template</h3>
          <p className="mt-1 text-xs text-stone-500">A Word (.docx) file. Mark every spot that changes with double braces, for example <code>{"{{employee_name}}"}</code>, <code>{"{{designation}}"}</code>, <code>{"{{joining_date}}"}</code>. Standard names are filled from the Employee Master; any other name becomes a blank field. Formatting is kept exactly as in your file.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Template name" required error={errors.name}>
              <input className={inputClass(Boolean(errors.name))} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Offer letter – 2026" />
            </Field>
            <Field label="Letter type" required error={errors.letterType}>
              <select className={inputClass()} value={form.letterType} onChange={(e) => setForm({ ...form, letterType: e.target.value })}>
                {LETTER_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </Field>
            <Field label="Word file" required error={errors.file}>
              <input ref={fileInput} className={inputClass(Boolean(errors.file))} type="file" accept=".docx" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })} />
            </Field>
          </div>
          <button className="btn-primary mt-3 disabled:opacity-60" disabled={busy} onClick={() => void upload()}>{busy ? "Uploading…" : "Upload template"}</button>
        </section>
      ) : (
        <p className="mb-4 text-xs text-stone-500">Only an Admin, CEO or COO can upload or change templates.</p>
      )}
      <div className="card overflow-hidden p-0">
        <FilterableTable rows={templates} columns={columns} loading={loading} emptyMessage="No templates uploaded yet." />
      </div>
    </>
  );
}

function History({ logs }: { logs: Log[] }) {
  const columns = useMemo<TableColumn<Log>[]>(
    () => [
      { key: "when", label: "Date & time", render: (l) => new Date(l.createdAt).toLocaleString("en-IN"), filterValue: (l) => new Date(l.createdAt).toLocaleString("en-IN") },
      { key: "type", label: "Letter", render: (l) => `${letterTypeLabel(l.letterType)} — ${l.templateName}`, filterValue: (l) => `${l.letterType} ${l.templateName}` },
      { key: "employee", label: "Employee", render: (l) => [l.employeeCode, l.employeeName].filter(Boolean).join(" · ") || "—", filterValue: (l) => `${l.employeeCode} ${l.employeeName}` },
      { key: "action", label: "Action", render: (l) => ACTIONS[l.action] ?? l.action, filterValue: (l) => ACTIONS[l.action] ?? l.action },
      { key: "to", label: "Sent to", render: (l) => l.sentTo || "—", filterValue: (l) => l.sentTo },
      { key: "by", label: "By", render: (l) => l.actorEmail, filterValue: (l) => l.actorEmail },
    ],
    [],
  );
  return (
    <div className="card overflow-hidden p-0">
      <FilterableTable rows={logs} columns={columns} emptyMessage="No letters have been generated yet." />
    </div>
  );
}
