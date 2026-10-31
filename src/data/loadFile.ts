// Reads CSV with PapaParse and XLSX/XLS with SheetJS. Each sheet becomes a table.
import Papa from "papaparse";
import { buildTable, type DataTable } from "../../shared/data";

/** Shown when an on-demand module can't load, usually because Halo restarted while this window stayed open. */
export const RELOAD_HINT = "Halo restarted or was updated while this window was open. Reload this window (⌘R), then try again.";

export async function loadDataFile(file: File): Promise<DataTable[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv" || ext === "tsv" || file.type === "text/csv") {
    return [parseCsv(file.name, await file.text())];
  }
  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
    // SheetJS is large; load it only when a workbook arrives.
    const { parseWorkbook } = await import("./workbook").catch(() => {
      throw new Error(RELOAD_HINT);
    });
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
