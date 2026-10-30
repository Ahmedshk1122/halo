// Reads CSV with PapaParse and XLSX/XLS with SheetJS. Each sheet becomes a table.
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { buildTable, type DataTable } from "../../shared/data";

export async function loadDataFile(file: File): Promise<DataTable[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv" || ext === "tsv" || file.type === "text/csv") {
    return [parseCsv(file.name, await file.text())];
  }
  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
    return parseWorkbook(file.name, await file.arrayBuffer());
  }
  throw new Error(`Unsupported file: ${file.name}. Use CSV or XLSX.`);
}

export function parseCsv(name: string, text: string): DataTable {
  const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  if (parsed.data.length < 2) throw new Error(`${name} has no data rows`);
  const [headers, ...rows] = parsed.data;
  return buildTable(name, null, headers, rows);
}

export function parseWorkbook(name: string, data: ArrayBuffer): DataTable[] {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const tables: DataTable[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    // raw: false returns each cell as displayed ("31.0%", "$1,234"), so percent and currency survive.
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, blankrows: false, defval: null });
    if (rows.length < 2) continue;
    const [headers, ...body] = rows;
    tables.push(buildTable(name, wb.SheetNames.length > 1 ? sheetName : null, (headers as unknown[]).map(String), body));
  }
  if (tables.length === 0) throw new Error(`${name} has no sheets with data`);
  return tables;
}
