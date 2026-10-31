// Loading data files into the catalog, from the Data section or a drop anywhere in the window.
import type { DataTable } from "../../shared/data";
import { loadDataFile } from "../data/loadFile";
import { store } from "./state";

export function addTables(incoming: DataTable[]) {
  store.set((s) => {
    const byName = new Map(s.tables.map((t) => [t.name, t]));
    for (const t of incoming) byName.set(t.name, t);
    return { tables: [...byName.values()] };
  });
}

/** Loads each file; returns one message per file that could not be read. */
export async function importDataFiles(files: FileList | File[]): Promise<string[]> {
  const errors: string[] = [];
  for (const f of Array.from(files)) {
    try {
      addTables(await loadDataFile(f));
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  store.set({ dataErrors: errors });
  return errors;
}

/**
 * Chrome opens a file dropped outside a drop zone, which would leave the app.
 * Catch drops anywhere in the control window and load them as data instead.
 */
export function catchWindowDrops() {
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.defaultPrevented && (e.target as Element)?.closest?.(".dropzone")) return;
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    store.set({ section: "data" });
    void importDataFiles(files);
  });
}
