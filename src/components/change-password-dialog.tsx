"use client";

import { useState } from "react";
import { Field, inputClass, Modal, RequiredLegend } from "@/components/form";
import { useToast } from "@/components/toast";
import { fieldErrorMap, jsonBody, requestJson } from "@/lib/client-api";
import { describeMissing, requiredErrors, type FormErrors } from "@/lib/form-validation";
import { PASSWORD_RULES } from "@/lib/validators";

const LABELS = {
  currentPassword: "Current password",
  newPassword: "New password",
  confirmPassword: "Confirm new password",
};

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);

  function set(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  }

  async function submit() {
    const missing = requiredErrors(form, Object.keys(LABELS), LABELS);
    if (Object.keys(missing).length) {
      setErrors(missing);
      toast.error(`Fill in the required fields before saving: ${describeMissing(missing, LABELS)}.`, { title: "Password not changed" });
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setErrors({ confirmPassword: "The two new passwords do not match. Type the same password in both boxes." });
      toast.error("The two new passwords do not match. Type the same password in both boxes.", { title: "Password not changed" });
      return;
    }
    setBusy(true);
    try {
      const body = await requestJson<{ message: string }>("/api/auth/change-password", jsonBody("POST", form));
      toast.success(body.message, { title: "Password changed" });
      onClose();
    } catch (error) {
      setErrors(fieldErrorMap(error));
      toast.fromError(error, "Password not changed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Change password"
      subtitle="Choose a new password for your management account."
      onClose={onClose}
      size="max-w-md"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary disabled:opacity-60" disabled={busy} onClick={submit}>
            {busy ? "Saving…" : "Change password"}
          </button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <RequiredLegend />
        <Field label={LABELS.currentPassword} required error={errors.currentPassword}>
          <input autoComplete="current-password" className={inputClass(Boolean(errors.currentPassword))} type="password" value={form.currentPassword} onChange={(event) => set("currentPassword", event.target.value)} />
        </Field>
        <Field label={LABELS.newPassword} required error={errors.newPassword} hint={PASSWORD_RULES}>
          <input autoComplete="new-password" className={inputClass(Boolean(errors.newPassword))} type="password" value={form.newPassword} onChange={(event) => set("newPassword", event.target.value)} />
        </Field>
        <Field label={LABELS.confirmPassword} required error={errors.confirmPassword}>
          <input autoComplete="new-password" className={inputClass(Boolean(errors.confirmPassword))} type="password" value={form.confirmPassword} onChange={(event) => set("confirmPassword", event.target.value)} />
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
