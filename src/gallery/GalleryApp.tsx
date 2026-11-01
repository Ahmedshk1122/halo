import { useEffect, useMemo, useState } from "react";
import { expandRect } from "../../shared/geometry";
import { preferredSlots, templateSize } from "../../shared/layout";
import { placeVisual } from "../../shared/placement";
import { prepareVisual } from "../../shared/resolve";
import type { GlassTheme, StageChip, StageState } from "../../shared/stage";
import { revealCount, TEMPLATE_LABELS } from "../../shared/visuals";
import { spokenNumbers } from "../../shared/spoken";
import { sampleTables } from "../data/samples";
import { CameraVideo } from "../stage/CameraVideo";
import { StageCanvas } from "../stage/StageCanvas";
import { StageViewport } from "../stage/StageViewport";
import { Backdrop, BACKDROP_FACE, type BackdropKind } from "./Backdrop";
import { SAMPLE_SPECS } from "./sampleSpecs";

const KEEP_OUT = expandRect(BACKDROP_FACE, { left: 40, right: 40, top: 60, bottom: 40 });
const SAMPLE_CHIPS: StageChip[] = [
  { id: "c1", title: "Activation rate", template: "metric" },
  { id: "c2", title: "Onboarding funnel", template: "funnel" },
];

/** /gallery: every template with sample data, on a stand-in camera feed. */
export function GalleryApp() {
  const [glass, setGlass] = useState<GlassTheme>("light");
  const [backing, setBacking] = useState<"auto" | "card" | "float">("auto");
  const [backdrop, setBackdrop] = useState<BackdropKind>("room");
  const [chips, setChips] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const [replay, setReplay] = useState(0);
  const [reveal, setReveal] = useState<Record<number, number>>({});
  const tables = useMemo(() => sampleTables(), []);

  useEffect(() => {
    document.title = "Halo Gallery";
    document.body.classList.add("is-gallery");
  }, []);

  const items = useMemo(
    () =>
      SAMPLE_SPECS.map((s) => {
        const result = prepareVisual(s.spec, tables, { said: spokenNumbers(s.said ?? "") });
        return { ...s, result };
      }),
    [tables],
  );

  const stageFor = (i: number): StageState | null => {
    const item = items[i];
    if (!item.result.ok) return null;
    const visual = item.result.visual;
    const size = templateSize(visual);
    const p = placeVisual(size, preferredSlots(visual), [], KEEP_OUT);
    const total = revealCount(visual);
    return {
      seq: replay,
      glass,
      visuals: [
        {
          id: `g${i}-${replay}`,
          visual,
          frame: p?.frame ?? { x: 48, y: 128, ...size },
          scale: p?.scale ?? 1,
          expanded: false,
          reveal: total ? Math.min(total, reveal[i] ?? item.reveal ?? total) : 0,
          target: null,
          dragging: false,
          float: backing === "float" || (backing === "auto" && item.result.spec.style === "float"),
        },
      ],
      chips: chips ? SAMPLE_CHIPS : [],
      keepOut: KEEP_OUT,
      cameraDeviceId: null,
      reducedMotion: false,
    };
  };

  const video = backdrop === "camera" ? <CameraVideo deviceId={null} /> : <Backdrop kind={backdrop} />;
  const shown = focus === null ? items.map((_, i) => i) : [focus];

  return (
    <div className="gallery">
      <header className="gallery-bar">
        <strong>Halo gallery</strong>
        <span className="gallery-sep" />
        <label>
          Glass
          <select value={glass} onChange={(e) => setGlass(e.target.value as GlassTheme)}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label>
          Behind visuals
          <select value={backing} onChange={(e) => setBacking(e.target.value as typeof backing)}>
            <option value="auto">Auto</option>
            <option value="card">Glass</option>
            <option value="float">Nothing</option>
          </select>
        </label>
        <label>
          Backdrop
          <select value={backdrop} onChange={(e) => setBackdrop(e.target.value as BackdropKind)}>
            <option value="room">Room</option>
            <option value="dusk">Dusk</option>
            <option value="camera">Camera</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={chips} onChange={(e) => setChips(e.target.checked)} /> Chips
        </label>
        <button type="button" onClick={() => setReplay((r) => r + 1)}>
          Replay
        </button>
        {focus !== null && (
          <button type="button" onClick={() => setFocus(null)}>
            All templates
          </button>
        )}
      </header>
      <main className={`gallery-grid${focus !== null ? " is-focus" : ""}`}>
        {shown.map((i) => {
          const item = items[i];
          const state = stageFor(i);
          const total = item.result.ok ? revealCount(item.result.visual) : 0;
          return (
            <figure key={i} className="gallery-tile" data-template={item.spec.template}>
              <div className="gallery-stage" onClick={() => setFocus(i)}>
                {state ? (
                  <StageViewport>
                    <StageCanvas state={state} video={video} />
                  </StageViewport>
                ) : (
                  <div className="gallery-error">
                    {!item.result.ok && `${item.result.stage}: ${item.result.errors.join("; ")}`}
                  </div>
                )}
              </div>
              <figcaption>
                <span>{item.name}</span>
                <span className="gallery-meta">
                  {TEMPLATE_LABELS[item.spec.template]}
                  {state && ` · ${state.visuals[0].frame.w}×${state.visuals[0].frame.h}`}
                </span>
                {total > 0 && (
                  <span className="gallery-reveal">
                    Reveal
                    <button type="button" onClick={() => setReveal((r) => ({ ...r, [i]: Math.max(0, (r[i] ?? item.reveal ?? total) - 1) }))}>
                      −
                    </button>
                    <button type="button" onClick={() => setReveal((r) => ({ ...r, [i]: Math.min(total, (r[i] ?? item.reveal ?? total) + 1) }))}>
                      +
                    </button>
                  </span>
                )}
              </figcaption>
            </figure>
          );
        })}
      </main>
    </div>
  );
}
