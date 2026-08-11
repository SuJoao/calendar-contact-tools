export function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv<T extends object>(rows: T[], columns: string[]): string {
  return [
    columns.map(csvCell).join(','),
    ...rows.map((row) =>
      columns.map((column) => csvCell((row as Record<string, unknown>)[column])).join(','),
    ),
  ].join('\r\n');
}
