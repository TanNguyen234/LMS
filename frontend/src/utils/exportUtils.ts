/**
 * Export and print helpers for LMS reports and gradebooks.
 */

const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;
const NUMERIC_STRING_RE = /^-?\d+(\.\d+)?$/;

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }
  let raw = String(value);
  if (raw.length > 0 && FORMULA_PREFIX_RE.test(raw) && !NUMERIC_STRING_RE.test(raw)) {
    raw = `'${raw}`;
  }
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function buildCsvContent(
  headers: string[],
  rows: Array<Array<unknown>>,
): string {
  const headerLine = headers.map((h) => escapeCsvCell(h)).join(',');
  const dataLines = rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(','));
  // Prepend UTF-8 BOM (\uFEFF) so Vietnamese accents render cleanly in Microsoft Excel.
  return `\uFEFF${[headerLine, ...dataLines].join('\r\n')}`;
}

export function exportToCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<unknown>>,
): void {
  const safeName = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  const csvContent = buildCsvContent(headers, rows);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function printSection(documentTitle?: string): void {
  const previousTitle = document.title;
  if (documentTitle) {
    document.title = documentTitle;
  }
  window.print();
  if (documentTitle) {
    window.setTimeout(() => {
      document.title = previousTitle;
    }, 300);
  }
}
