"use client";

import { ReactNode, useMemo, useState } from "react";

export type TableColumn<T> = {
  key: string;
  label: string;
  render: (row: T, index: number) => ReactNode;
  filterValue?: (row: T, index: number) => unknown;
  filterable?: boolean;
  className?: string;
  /** Columns with the same group name sit under one shared banner above their headings. */
  group?: string;
};

// Tints cycle through the existing brand palette so neighbouring groups are easy to tell apart.
const GROUP_TONES = [
  "bg-orange-50 text-kenko-orange",
  "bg-green-50 text-kenko-green",
  "bg-amber-50 text-amber-800",
  "bg-stone-100 text-stone-700",
];

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

  // Consecutive columns that share a group merge into one banner cell.
  const { bands, groupStarts } = useMemo(() => {
    const bands: { label: string; span: number; tone: string }[] = [];
    const groupStarts = new Set<string>();
    const toneByGroup = new Map<string, string>();
    columns.forEach((column, index) => {
      const label = column.group ?? "";
      const previous = index > 0 ? (columns[index - 1].group ?? "") : null;
      if (previous === label && bands.length) {
        bands[bands.length - 1].span += 1;
        return;
      }
      if (label && !toneByGroup.has(label)) toneByGroup.set(label, GROUP_TONES[toneByGroup.size % GROUP_TONES.length]);
      if (label && index > 0) groupStarts.add(column.key);
      bands.push({ label, span: 1, tone: label ? toneByGroup.get(label)! : "" });
    });
    return { bands, groupStarts };
  }, [columns]);
  const grouped = bands.some((band) => band.label);
  const edge = (key: string) => (groupStarts.has(key) ? "border-l-2 border-l-stone-300" : "");

  return (
    <div className="max-w-full overflow-x-auto">
      <table className="w-max min-w-full">
        <thead>
          {grouped && (
            <tr>
              {bands.map((band, index) => (
                <th
                  colSpan={band.span}
                  key={`${band.label}-${index}`}
                  className={`whitespace-nowrap px-3 py-2 text-[11px] font-bold tracking-wide sm:px-4 ${band.tone || "bg-white"} ${band.label && index > 0 ? "border-l-2 border-l-stone-300" : ""}`}
                >
                  {band.label}
                </th>
              ))}
            </tr>
          )}
          <tr>
            {columns.map((column) => (
              <th className={`whitespace-nowrap px-3 py-3 sm:px-4 ${edge(column.key)} ${column.className ?? ""}`} key={column.key}>
                {column.label}
              </th>
            ))}
          </tr>
          <tr>
            {columns.map((column) => (
              <th className={`bg-white px-2 py-2 ${edge(column.key)}`} key={column.key}>
                {column.filterable === false ? null : (
                  <input
                    aria-label={`Filter ${column.label}`}
                    className="min-w-24 rounded-md border border-stone-200 px-2 py-1 text-xs font-normal normal-case tracking-normal outline-none focus:border-kenko-orange sm:min-w-28"
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
                <td className={`whitespace-nowrap px-3 py-2.5 sm:px-4 sm:py-3 ${edge(column.key)} ${column.className ?? ""}`} key={column.key}>
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
