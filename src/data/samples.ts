// Sample files bundled with the app: used by /gallery and "Load sample data".
import funnelCsv from "../../samples/onboarding_funnel.csv?raw";
import metricsCsv from "../../samples/q3_metrics.csv?raw";
import type { DataTable } from "../../shared/data";
import { parseCsv } from "./loadFile";

export function sampleTables(): DataTable[] {
  return [parseCsv("q3_metrics.csv", metricsCsv), parseCsv("onboarding_funnel.csv", funnelCsv)];
}
