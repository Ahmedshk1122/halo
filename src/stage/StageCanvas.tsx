import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useMemo, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { CHIP_FONT, chipWidth, layoutChips } from "../../shared/chips";
import { STAGE_W, type Rect } from "../../shared/geometry";
import type { StageState } from "../../shared/stage";
import { TemplateIcon } from "../templates/icons";
import { EXIT, SPRING } from "../templates/motion";
import { VisualFrame, type ExitTargets } from "./VisualFrame";

let measureCtx: CanvasRenderingContext2D | null = null;
function measureChipText(text: string): number {
  if (!measureCtx) {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  if (!measureCtx) return text.length * CHIP_FONT * 0.53;
  measureCtx.font = `600 ${CHIP_FONT}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
  return measureCtx.measureText(text).width;
}

interface Props {
  state: StageState;
  /** Mirror for the presenter preview: video and positions flip, text stays readable. */
  mirror?: boolean;
  video?: ReactNode;
  onRendered?: (id: string) => void;
  onVisualPointerDown?: (id: string, e: ReactPointerEvent<HTMLDivElement>) => void;
  onVisualDoubleClick?: (id: string) => void;
  onChipClick?: (id: string) => void;
  /** Extra layer on top (presenter-only overlays in the control preview). */
  overlay?: ReactNode;
}

/** The 1920×1080 stage: camera, visuals, chips. Shared by /stage and the control preview. */
export function StageCanvas({
  state,
  mirror = false,
  video,
  onRendered,
  onVisualPointerDown,
  onVisualDoubleClick,
  onChipClick,
  overlay,
}: Props) {
  const chipRects = useMemo(
    () =>
      layoutChips(
        state.chips.map((c) => ({ id: c.id, width: chipWidth(measureChipText(c.title)) })),
        state.keepOut,
      ),
    [state.chips, state.keepOut],
  );

  // Remember where each chip was so a recalled visual can grow out of it.
  const lastChipRects = useRef<Record<string, Rect>>({});
  const enterFrom = useRef<Record<string, Rect | null>>({});
  for (const v of state.visuals) {
    if (!(v.id in enterFrom.current)) {
      enterFrom.current[v.id] = lastChipRects.current[v.id] ?? null;
    }
  }
  for (const id of Object.keys(enterFrom.current)) {
    if (!state.visuals.some((v) => v.id === id)) delete enterFrom.current[id];
  }
  lastChipRects.current = { ...lastChipRects.current, ...chipRects };

  const exitTargets: ExitTargets = { chips: chipRects, mirror };

  return (
    <MotionConfig reducedMotion={state.reducedMotion ? "always" : "user"}>
      <div className="stage-canvas" data-mirror={mirror || undefined}>
        <div className="stage-video">{video}</div>
        <div className="stage-visuals">
          <AnimatePresence custom={exitTargets}>
            {state.visuals.map((sv) => (
              <VisualFrame
                key={sv.id}
                sv={sv}
                glass={state.glass}
                mirror={mirror}
                enterFrom={enterFrom.current[sv.id] ?? null}
                onRendered={onRendered}
                onPointerDown={onVisualPointerDown}
                onDoubleClick={onVisualDoubleClick}
              />
            ))}
          </AnimatePresence>
        </div>
        <div className="stage-chips">
          <AnimatePresence>
            {state.chips.map((chip) => {
              const r = chipRects[chip.id];
              if (!r) return null;
              const x = mirror ? STAGE_W - r.x - r.w : r.x;
              return (
                <motion.button
                  key={chip.id}
                  type="button"
                  className="halo-glass stage-chip"
                  data-glass={state.glass}
                  data-chip-id={chip.id}
                  tabIndex={-1}
                  style={{ width: r.w, height: r.h }}
                  initial={{ opacity: 0, scale: 0.6, x, y: r.y }}
                  animate={{ opacity: 1, scale: 1, x, y: r.y }}
                  exit={{ opacity: 0, scale: 0.8, transition: EXIT }}
                  transition={{ ...SPRING, opacity: { duration: 0.24, delay: 0.16 } }}
                  onClick={onChipClick ? () => onChipClick(chip.id) : undefined}
                >
                  <span className="stage-chip-icon">
                    <TemplateIcon template={chip.template} size={26} />
                  </span>
                  <span className="stage-chip-title">{chip.title}</span>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
        {overlay}
      </div>
    </MotionConfig>
  );
}
