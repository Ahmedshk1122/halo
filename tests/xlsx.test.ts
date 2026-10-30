import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbook } from "../src/data/workbook";

describe("XLSX upload", () => {
  it("keeps percent formatting and makes one table per sheet", () => {
    const wb = XLSX.utils.book_new();
    const metrics = XLSX.utils.aoa_to_sheet([
      ["week", "activation_rate"],
      ["W1", 0.31],
      ["W2", 0.318],
    ]);
    for (const cell of ["B2", "B3"]) metrics[cell].z = "0.0%";
    XLSX.utils.book_append_sheet(wb, metrics, "Metrics");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["step", "users"], ["Signed up", 1200], ["Verified", 1032]]), "Funnel");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const tables = parseWorkbook("q3.xlsx", buf);
    expect(tables.map((t) => t.name)).toEqual(["q3_metrics", "q3_funnel"]);
    expect(tables[0].columns[1].kind).toBe("percent");
    expect(tables[0].rows.map((r) => r.activation_rate)).toEqual([31, 31.8]);
    expect(tables[1].rows[1].users).toBe(1032);
  });
});
