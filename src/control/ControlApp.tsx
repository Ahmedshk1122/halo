import { Database, FileText, Play, Radio, Settings } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useStore } from "./createStore";
import { Inspector } from "./Inspector";
import { startDirector } from "./director/setup";
import { startHandSync } from "./hands/handController";
import { Preview } from "./Preview";
import { ListenButton, LatencyPill } from "./Toolbar";
import { restore, startPersisting } from "./persist";
import { RehearsalSection } from "./sections/RehearsalSection";
import { DataSection } from "./sections/DataSection";
import { NotesSection } from "./sections/NotesSection";
import { LiveSection } from "./sections/LiveSection";
import { SettingsSection } from "./sections/SettingsSection";
import { startStageSync } from "./stageSync";
import { store, type Section } from "./state";
import { Button } from "./ui/controls";
import { useServerHealth } from "./useServerHealth";

const NAV: { id: Section; label: string; icon: ReactNode }[] = [
  { id: "live", label: "Live", icon: <Radio size={16} strokeWidth={1.75} /> },
  { id: "data", label: "Data", icon: <Database size={16} strokeWidth={1.75} /> },
  { id: "notes", label: "Talk notes", icon: <FileText size={16} strokeWidth={1.75} /> },
  { id: "rehearsal", label: "Rehearsal", icon: <Play size={16} strokeWidth={1.75} /> },
  { id: "settings", label: "Settings", icon: <Settings size={16} strokeWidth={1.75} /> },
];

export function openStageWindow() {
  window.open("/stage", "halo-stage", "popup=yes,width=1280,height=720");
}

export function ControlApp() {
  const section = useStore(store, (s) => s.section);
  const stage = useStore(store, (s) => s.stage);
  const health = useServerHealth();

  useEffect(() => {
    document.title = "Halo";
    document.body.classList.add("is-control");
    restore();
    startPersisting();
    startStageSync();
    startDirector();
    startHandSync();
  }, []);

  const current = NAV.find((n) => n.id === section)!;

  return (
    <div className="ctl">
      <aside className="ctl-sidebar">
        <div className="ctl-brand">
          <span className="ctl-brand-mark" aria-hidden />
          Halo
        </div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`ctl-nav-item${n.id === section ? " is-on" : ""}`}
              onClick={() => store.set({ section: n.id })}
            >
              {n.icon}
              {n.label}
            </button>
          ))}
        </nav>
        <div className="ctl-sidebar-footer">
          <div className="status-line">
            <span className={`dot ${stage.connected ? "is-good" : "is-warn"}`} />
            {stage.connected ? "Stage connected" : "Stage not open"}
          </div>
          <div className="status-line">
            <span className={`dot ${health.state === "ok" ? (health.hasKey ? "is-good" : "is-warn") : "is-bad"}`} />
            {health.state === "ok" ? (health.hasKey ? `Claude ready · ${health.directorModel}` : "No API key in .env") : "Server offline"}
          </div>
        </div>
      </aside>

      <main className="ctl-main">
        <header className="ctl-toolbar">
          <h1>{current.label}</h1>
          <div className="ctl-toolbar-spacer" />
          <LatencyPill />
          <ListenButton />
          <Button onClick={openStageWindow} title="Open the window OBS captures">
            Open stage window
          </Button>
        </header>
        <div className="ctl-center">
          {section === "live" && <LiveSection />}
          {(section === "data" || section === "notes" || section === "settings") && <Preview compact />}
          {section === "data" && <DataSection />}
          {section === "notes" && <NotesSection />}
          {section === "rehearsal" && <RehearsalSection />}
          {section === "settings" && <SettingsSection />}
        </div>
      </main>

      <Inspector />
    </div>
  );
}
