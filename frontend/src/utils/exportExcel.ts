import * as XLSX from 'xlsx';

export interface ExportTableOptions {
  filename: string;
  sheetName?: string;
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
}

/**
 * Exports data to a genuine Excel workbook (.xlsx).
 * Uses UTF-8 internally in the OpenXML package to guarantee 100% accurate Vietnamese character rendering.
 */
export function exportToExcel({
  filename,
  sheetName = 'Sheet1',
  headers,
  rows,
}: ExportTableOptions): void {
  // Format cells: convert null / undefined to empty string
  const cleanRows = rows.map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? '' : cell))
  );

  const aoaData = [headers, ...cleanRows];
  const ws = XLSX.utils.aoa_to_sheet(aoaData);

  // Auto-calculate column widths
  const colWidths = headers.map((header, colIdx) => {
    let maxLen = header.length;
    for (const row of cleanRows) {
      const cellVal = row[colIdx];
      const strVal = cellVal !== undefined && cellVal !== null ? String(cellVal) : '';
      if (strVal.length > maxLen) {
        maxLen = strVal.length;
      }
    }
    // Min width 12, max width 50, padding + 3
    return { wch: Math.min(Math.max(maxLen + 3, 12), 50) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));

  const cleanFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, cleanFilename, { bookType: 'xlsx', compression: true });
}

/**
 * Exports data to a CSV file with UTF-8 BOM (\uFEFF) and properly escaped values.
 */
export function exportToCsv({
  filename,
  headers,
  rows,
}: Omit<ExportTableOptions, 'sheetName'>): void {
  const cleanRows = rows.map((row) =>
    row
      .map((cell) => {
        const val = cell === null || cell === undefined ? '' : String(cell);
        return `"${val.replace(/"/g, '""')}"`;
      })
      .join(',')
  );

  const csvContent =
    '\uFEFF' +
    [headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','), ...cleanRows].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const cleanFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.setAttribute('download', cleanFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Converts an uploaded File (XLSX, XLS or CSV) into a standard UTF-8 CSV File.
 * If the file is already CSV, it is returned directly.
 * If the file is Excel (.xlsx/.xls), SheetJS parses it and converts Sheet 1 to CSV.
 */
export async function normalizeImportFileToCsv(file: File): Promise<File> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'csv') {
    return file;
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('Tệp Excel không chứa trang tính (sheet) nào.');
    }
    const sheet = wb.Sheets[firstSheetName];
    const csvString = XLSX.utils.sheet_to_csv(sheet);
    const newFilename = file.name.replace(/\.[^/.]+$/, '.csv');
    return new File(['\uFEFF' + csvString], newFilename, {
      type: 'text/csv;charset=utf-8;',
    });
  }

  return file;
}
