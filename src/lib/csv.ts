/** RFC 4180 CSV serialisation with protection against spreadsheet formula injection. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const cell = (v: unknown) => {
    if (v == null) return '';
    let s = Array.isArray(v) ? v.join(' ') : v instanceof Date ? v.toISOString() : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
