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
}: {
  rows: T[];
  columns: TableColumn<T>[];
  emptyMessage: string;
}) {
  const [filters, setFilters] = useState<Record<string, string>>({});
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

  return (
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
                    onChange={(event) => setFilters((current) => ({ ...current, [column.key]: event.target.value }))}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((row, index) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td className={`whitespace-nowrap px-4 py-3 ${column.className ?? ""}`} key={column.key}>
                  {column.render(row, index)}
                </td>
              ))}
            </tr>
          ))}
          {!filtered.length && (
            <tr>
              <td className="px-4 py-8 text-center text-stone-500" colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
