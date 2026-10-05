import { z } from "zod";
import { AppError } from "@/lib/app-error";

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // Vercel functions accept request bodies up to about 4.5 MB.

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};
export const ALLOWED_EXTENSIONS = Object.keys(TYPES);

export function readFile(file: FormDataEntryValue | null, allowed: string[] = ALLOWED_EXTENSIONS) {
  if (!file || typeof file === "string") return null;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowed.includes(extension)) {
    throw new AppError(`“${file.name}” is not an accepted file type. Upload one of: ${allowed.join(", ")}.`, { status: 400, code: "FILE_TYPE", fields: [{ field: "file", message: "Choose a file of an accepted type." }] });
  }
  if (file.size === 0) throw new AppError(`“${file.name}” is empty.`, { status: 400, code: "FILE_EMPTY", fields: [{ field: "file", message: "This file is empty." }] });
  if (file.size > MAX_FILE_BYTES) {
    throw new AppError(`“${file.name}” is ${(file.size / 1048576).toFixed(1)} MB. The limit is 4 MB. Compress the file or split it, then upload again.`, { status: 413, code: "FILE_TOO_LARGE", fields: [{ field: "file", message: "File is larger than 4 MB." }] });
  }
  return { name: file.name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 150), mimeType: TYPES[extension], size: file.size, extension, file };
}

const idList = z.preprocess((value) => {
  if (typeof value === "string") {
    try { return JSON.parse(value || "[]"); } catch { return value; }
  }
  return value ?? [];
}, z.array(z.string().min(1)).max(200));

export const sopFieldsSchema = z.object({
  title: z.string({ required_error: "Enter a title." }).trim().min(2, "Enter a title (at least 2 characters).").max(160),
  description: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(1000).optional()),
  audience: z.enum(["ALL", "TAGGED"], { errorMap: () => ({ message: "Choose who the document applies to." }) }),
  departmentIds: idList,
  roleIds: idList,
}).superRefine((value, ctx) => {
  if (value.audience === "TAGGED" && value.departmentIds.length + value.roleIds.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["departmentIds"], message: "Pick at least one division or role, or choose “All employees”." });
  }
});

export type SopTagging = { audience: string; departmentIds: string[]; roleIds: string[] };

/** An employee sees a document tagged to their division OR their role; “All employees” documents are seen by everyone. */
export function sopVisibleTo(sop: SopTagging, employee: { departmentId: string | null; employeeRoleId: string | null }) {
  if (sop.audience === "ALL") return true;
  return (
    (employee.departmentId !== null && sop.departmentIds.includes(employee.departmentId)) ||
    (employee.employeeRoleId !== null && sop.roleIds.includes(employee.employeeRoleId))
  );
}

export const SOP_LIST_SELECT = {
  id: true, title: true, description: true, fileName: true, mimeType: true, sizeBytes: true, version: true,
  audience: true, departmentIds: true, roleIds: true, uploadedByEmail: true, createdAt: true, updatedAt: true,
} as const;
