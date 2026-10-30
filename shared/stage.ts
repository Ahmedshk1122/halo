// What the stage window renders. The control window owns all state and sends a
// StageState snapshot over BroadcastChannel whenever anything changes. The stage
// is a pure renderer of this snapshot.

import type { Rect } from "./geometry";
import type { ResolvedVisual, TemplateId } from "./visuals";

export type GlassTheme = "light" | "dark";

export interface StageVisual {
  id: string;
  visual: ResolvedVisual;
  /** Top-left position and natural size in stage (1920×1080) coordinates. */
  frame: Rect;
  /** Render scale (expanded visuals and squeezed placements). */
  scale: number;
  expanded: boolean;
  /** Progressive items revealed so far. Ignored by templates without reveal. */
  reveal: number;
  /** data-part id highlighted with the orange ring, if any. */
  target: string | null;
  /** True while the presenter is dragging it (no spring lag on position). */
  dragging: boolean;
}

export interface StageChip {
  id: string;
  title: string;
  template: TemplateId;
}

export interface StageState {
  seq: number;
  glass: GlassTheme;
  visuals: StageVisual[];
  chips: StageChip[];
  /** Face keep-out zone (stage coordinates). Used for chip layout; never drawn. */
  keepOut: Rect | null;
  cameraDeviceId: string | null;
  reducedMotion: boolean;
}

export const EMPTY_STAGE: StageState = {
  seq: 0,
  glass: "light",
  visuals: [],
  chips: [],
  keepOut: null,
  cameraDeviceId: null,
  reducedMotion: false,
};

// Messages on the "halo" BroadcastChannel.
export type ChannelMessage =
  | { type: "state"; state: StageState }
  | { type: "stage-hello"; at: number }
  | { type: "control-hello" }
  | { type: "rendered"; id: string; at: number }
  | { type: "stage-status"; camera: string; size: { w: number; h: number } | null }
  | { type: "stage-bye" };
