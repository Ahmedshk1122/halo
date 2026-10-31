import { FileSpreadsheet, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { formatLabel, formatValue, type DataTable } from "../../../shared/data";
import { sampleTables } from "../../data/samples";
import { addTables, importDataFiles } from "../dataImport";
import { useStore } from "../createStore";
import { store } from "../state";
import { Button, Empty, Group, Pill } from "../ui/controls";

export function DataSection() {
  const tables = useStore(store, (s) => s.tables);
  const [over, setOver] = useState(false);
  const errors = useStore(store, (s) => s.dataErrors);
  const input = useRef<HTMLInputElement>(null);
  const load = (files: FileList | File[]) => void importDataFiles(files);

  return (
    <>
      <div
        className={`dropzone${over ? " is-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          load(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
      >
        <Upload size={22} strokeWidth={1.75} />
        <div className="dropzone-title">Drop CSV or XLSX files</div>
        <div className="muted">Numbers on screen come only from these files. Each sheet becomes a table.</div>
        <input
          ref={input}
          type="file"
          accept=".csv,.tsv,.xlsx,.xls,.xlsm"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) load(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <div className="data-actions">
        <Button onClick={() => addTables(sampleTables())}>Load sample data</Button>
        {tables.length > 0 && (
          <Button variant="plain" onClick={() => store.set({ tables: [] })}>
            Remove all
          </Button>
        )}
      </div>
      {errors.map((e) => (
        <p key={e} className="data-error">
          {e}
        </p>
      ))}
      {tables.length === 0 ? (
        <Empty title="No data loaded">Halo will not show any numbers until you load data.</Empty>
      ) : (
        tables.map((t) => <TableCard key={t.name} table={t} />)
      )}
    </>
  );
}

function TableCard({ table }: { table: DataTable }) {
  const preview = table.rows.slice(0, 6);
  return (
    <Group
      title={
        <span className="table-title">
          <FileSpreadsheet size={14} strokeWidth={1.75} />
          <span className="mono">{table.name}</span>
          <span className="muted">
            {table.rows.length} rows · {table.file}
            {table.sheet ? ` · ${table.sheet}` : ""}
          </span>
        </span>
      }
      actions={
        <Button variant="plain" onClick={() => store.set((s) => ({ tables: s.tables.filter((x) => x.name !== table.name) }))}>
          Remove
        </Button>
      }
    >
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {table.columns.map((c) => (
                <th key={c.name}>
                  <span className="mono">{c.name}</span>
                  <Pill tone={c.kind === "text" || c.kind === "date" ? "neutral" : "accent"}>{c.kind}</Pill>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((r, i) => (
              <tr key={i}>
                {table.columns.map((c) => {
                  const v = r[c.name];
                  return <td key={c.name}>{typeof v === "number" ? formatValue(v, c) : formatLabel(v, c.kind)}</td>;
                })}
              </tr>
            ))}
            {table.rows.length > preview.length && (
              <tr>
                <td colSpan={table.columns.length} className="muted">
                  {table.rows.length - preview.length} more rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Group>
  );
}
