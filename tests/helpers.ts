import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { buildTable, type DataTable } from "../shared/data";

/** Loads a sample CSV the same way the browser does (PapaParse, header row). */
export function loadSampleCsv(name: string): DataTable {
  const text = readFileSync(new URL(`../samples/${name}`, import.meta.url), "utf8");
  const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  const [headers, ...rows] = parsed.data;
  return buildTable(name, null, headers, rows);
}

export function sampleCatalog(): DataTable[] {
  return [loadSampleCsv("q3_metrics.csv"), loadSampleCsv("onboarding_funnel.csv")];
}
