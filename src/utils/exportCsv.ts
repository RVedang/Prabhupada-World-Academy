/**
 * Generates a CSV file and triggers a browser download.
 * 
 * Overload 1: exportToCsv(rows, filename) — 2D array (headers included in rows)
 * Overload 2: exportToCsv(filename, headers, rows) — separate headers + rows
 */
export function exportToCsv(
  filenameOrRows: string | any[][],
  headersOrFilename?: string[] | string,
  rows?: (string | number | null | undefined)[][],
  options?: { textColumns?: string[] }
): void {
  let filename: string;
  let allLines: any[][];
  let textColumns = new Set<string>();

  if (Array.isArray(filenameOrRows)) {
    // Overload 1: exportToCsv(rows, filename)
    allLines = filenameOrRows;
    filename = (headersOrFilename as string) || 'export.csv';
  } else {
    // Overload 2: exportToCsv(filename, headers, rows)
    filename = filenameOrRows;
    const headers = headersOrFilename as string[];
    allLines = [headers, ...(rows || [])];
    textColumns = new Set(options?.textColumns || []);
  }

  const escape = (cell: any, isTextColumn = false): string => {
    let str = cell == null ? '' : String(cell);
    if (isTextColumn) str = str.replace(/^'+/, '');
    if (isTextColumn && str) str = `="${str.replace(/"/g, '""')}"`;
    // Prevent spreadsheet formula execution when an exported value is opened
    // in Excel/Sheets. Preserve ordinary negative numeric values.
    if (!isTextColumn && (/^[=+@\t\r]/.test(str) || (/^-/.test(str) && !/^-\d+(?:\.\d+)?$/.test(str)))) {
      str = `'${str}`;
    }
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvContent = allLines.map((row, rowIndex) =>
    (Array.isArray(row) ? row : [row]).map((cell, index) => escape(cell, rowIndex > 0 && textColumns.has(String(allLines[0]?.[index] || '')))).join(',')
  ).join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  if (!document.body) return;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
