import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { STAGE_W, type Rect } from "../../shared/geometry";
import type { GlassTheme, StageVisual } from "../../shared/stage";
import { VisualContent } from "../templates/Visual";
import { ENTER_BLUR, ENTER_FROM, EXIT, SPRING, SPRING_SOFT, TUCK } from "../templates/motion";

export interface ExitTargets {
  /** Chip rects by visual id: a visual leaving into a chip shrinks into it. */
  chips: Record<string, Rect>;
  mirror: boolean;
}

interface Props {
  sv: StageVisual;
  glass: GlassTheme;
  mirror: boolean;
  /** Where the visual enters from when it is recalled from a chip. */
  enterFrom: Rect | null;
  onRendered?: (id: string) => void;
  onPointerDown?: (id: string, e: ReactPointerEvent<HTMLDivElement>) => void;
  onDoubleClick?: (id: string) => void;
}

function mirrorX(x: number, w: number, mirror: boolean) {
  return mirror ? STAGE_W - x - w : x;
}

/** Positions a visual on the stage, draws the glass, and runs entrance/exit motion. */
export function VisualFrame({ sv, glass, mirror, enterFrom, onRendered, onPointerDown, onDoubleClick }: Props) {
  const { frame } = sv;
  const x = mirrorX(frame.x, frame.w, mirror);

  // Recalled visuals grow out of their chip; new ones appear in place.
  const initial = enterFrom
    ? {
        x: mirrorX(enterFrom.x, enterFrom.w, mirror) + enterFrom.w / 2 - frame.w / 2,
        y: enterFrom.y + enterFrom.h / 2 - frame.h / 2,
        scale: Math.max(0.08, enterFrom.h / frame.h),
      }
    : { x, y: frame.y, scale: sv.scale * ENTER_FROM.scale };

  useEffect(() => {
    if (!onRendered) return;
    const raf = requestAnimationFrame(() => onRendered(sv.id));
    return () => cancelAnimationFrame(raf);
    // Only on mount: latency is measured to the first frame of the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      className="visual-frame"
      data-visual-id={sv.id}
      style={{ width: frame.w, height: frame.h, zIndex: sv.dragging ? 20 : 10 }}
      custom={sv.id}
      initial={initial}
      animate={{ x, y: frame.y, scale: sv.scale }}
      exit="exit"
      variants={{
        exit: (targets: ExitTargets | string) => {
          const chip = typeof targets === "object" ? targets.chips[sv.id] : undefined;
          if (!chip) return { scale: sv.scale * 0.98, transition: EXIT };
          const m = typeof targets === "object" && targets.mirror;
          return {
            x: mirrorX(chip.x, chip.w, m) + chip.w / 2 - frame.w / 2,
            y: chip.y + chip.h / 2 - frame.h / 2,
            scale: Math.max(0.08, chip.h / frame.h),
            transition: TUCK,
          };
        },
      }}
      transition={sv.dragging ? { duration: 0 } : SPRING}
      onPointerDown={onPointerDown ? (e) => onPointerDown(sv.id, e) : undefined}
      onDoubleClick={onDoubleClick ? () => onDoubleClick(sv.id) : undefined}
    >
      <motion.div
        className="halo-glass visual-glass"
        data-glass={sv.float ? (sv.ink === "dark" ? "light" : "dark") : (sv.glass ?? glass)}
        data-backing={sv.float ? "float" : "card"}
        data-ink={sv.float ? (sv.ink ?? "light") : undefined}
        data-accent={sv.visual.accent}
        data-template={sv.visual.template}
        initial={{ opacity: enterFrom ? 0.4 : ENTER_FROM.opacity }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: EXIT }}
        transition={SPRING}
      >
        <motion.div
          className="visual-content"
          initial={{ filter: ENTER_BLUR }}
          animate={{ filter: "blur(0px)", transitionEnd: { filter: "none" } }}
          exit={{ filter: "blur(8px)", transition: EXIT }}
          transition={SPRING}
        >
          <VisualContent v={sv.visual} ctx={{ reveal: sv.reveal, expanded: sv.expanded }} />
        </motion.div>
        <TargetRing target={sv.target} reveal={sv.reveal} />
      </motion.div>
    </motion.div>
  );
}

/** Offset of an element inside an ancestor, in layout (untransformed) pixels. */
function offsetWithin(el: HTMLElement, ancestor: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== ancestor) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

function partRect(part: Element, glass: HTMLElement): Rect | null {
  if (part instanceof SVGGraphicsElement && part.ownerSVGElement) {
    const svg = part.ownerSVGElement;
    const box = part.getBBox();
    const parent = svg.parentElement;
    if (!parent) return null;
    const base = offsetWithin(parent, glass);
    // SVGs in templates use a 1:1 viewBox, placed at the top-left of their wrapper.
    return { x: base.x + svg.x.baseVal.value + box.x, y: base.y + svg.y.baseVal.value + box.y, w: box.width, h: box.height };
  }
  if (part instanceof HTMLElement) {
    const o = offsetWithin(part, glass);
    return { x: o.x, y: o.y, w: part.offsetWidth, h: part.offsetHeight };
  }
  return null;
}

/** Orange ring around the pointed-at part of a visual. */
function TargetRing({ target, reveal }: { target: string | null; reveal: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<(Rect & { radius: number }) | null>(null);

  useLayoutEffect(() => {
    const glass = ref.current?.parentElement;
    if (!glass || !target) {
      setRect(null);
      return;
    }
    const part = glass.querySelector(`[data-part="${CSS.escape(target)}"]`);
    const r = part ? partRect(part, glass) : null;
    if (!r || !part) {
      setRect(null);
      return;
    }
    const radius = part instanceof HTMLElement ? parseFloat(getComputedStyle(part).borderTopLeftRadius) || 12 : 12;
    setRect({ ...r, radius });
  }, [target, reveal]);

  const pad = 8;
  return (
    <div ref={ref} className="target-ring-layer">
      {rect && (
        <motion.div
          key={target}
          className="halo-target-ring"
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING_SOFT}
          style={{
            left: rect.x - pad,
            top: rect.y - pad,
            width: rect.w + pad * 2,
            height: rect.h + pad * 2,
            borderRadius: rect.radius + pad,
          }}
        />
      )}
    </div>
  );
}
