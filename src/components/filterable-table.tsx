"use client";

import { ReactNode, useMemo, useState } from "react";

export type TableColumn<T> = {
  key: string;
  label: string;
  render: (row: T, index: number) => ReactNode;
  filterValue?: (row: T, index: number) => unknown;
  filterable?: boolean;
  className?: string;
};

export function FilterableTable<T extends { id: string }>({
  rows,
  columns,
  emptyMessage,
  loading = false,
  pageSize = 50,
}: {
  rows: T[];
  columns: TableColumn<T>[];
  emptyMessage: string;
  loading?: boolean;
  pageSize?: number;
}) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const filtered = useMemo(
    () =>
      rows.filter((row, index) =>
        columns.every((column) => {
          const query = filters[column.key]?.trim().toLocaleLowerCase();
          if (!query || column.filterable === false) return true;
          const value = column.filterValue?.(row, index);
          return String(value ?? "")
            .toLocaleLowerCase()
            .includes(query);
        }),
      ),
    [columns, filters, rows],
  );
  // Render one page at a time so long lists stay fast on phones. Filters still search every row.
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = filtered.slice(current * pageSize, (current + 1) * pageSize);
  const offset = current * pageSize;

  return (
    <div>
    <div className="overflow-x-auto">
      <table className="w-max min-w-full">
        <thead>
          <tr>
            {columns.map((column) => (
              <th className={`whitespace-nowrap px-4 py-3 ${column.className ?? ""}`} key={column.key}>
                {column.label}
              </th>
            ))}
          </tr>
          <tr>
            {columns.map((column) => (
              <th className="bg-white px-2 py-2" key={column.key}>
                {column.filterable === false ? null : (
                  <input
                    aria-label={`Filter ${column.label}`}
                    className="min-w-28 rounded-md border border-stone-200 px-2 py-1 text-xs font-normal normal-case tracking-normal outline-none focus:border-kenko-orange"
                    placeholder="Filter…"
                    value={filters[column.key] ?? ""}
                    onChange={(event) => { setPage(0); setFilters((previous) => ({ ...previous, [column.key]: event.target.value })); }}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!loading && visible.map((row, index) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td className={`whitespace-nowrap px-4 py-3 ${column.className ?? ""}`} key={column.key}>
                  {column.render(row, offset + index)}
                </td>
              ))}
            </tr>
          ))}
          {(loading || !filtered.length) && (
            <tr>
              <td className="px-4 py-8 text-center text-stone-500" colSpan={columns.length}>
                {loading ? "Loading…" : emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    {!loading && filtered.length > pageSize && (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 px-4 py-3 text-sm">
        <span className="text-stone-500">Showing {offset + 1}–{Math.min(offset + pageSize, filtered.length)} of {filtered.length}</span>
        <span className="flex gap-2">
          <button className="btn bg-stone-100 disabled:opacity-40" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button>
          <button className="btn bg-stone-100 disabled:opacity-40" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>Next</button>
        </span>
      </div>
    )}
    </div>
  );
}
