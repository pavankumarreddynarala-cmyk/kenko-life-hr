import * as XLSX from "xlsx";
export function workbookResponse(rows: Record<string, unknown>[], sheetName: string) { const sheet = XLSX.utils.json_to_sheet(rows); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, sheetName); return XLSX.write(book, { type: "buffer", bookType: "xlsx" }); }
