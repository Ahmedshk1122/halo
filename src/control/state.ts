// All Halo state lives here, in the control window. The stage window only
// renders the StageState derived from it.

import type { DataTable } from "../../shared/data";
import type { Rect } from "../../shared/geometry";
import type { Slot } from "../../shared/layout";
import type { GlassTheme } from "../../shared/stage";
import type { ResolvedVisual, VisualSpec } from "../../shared/visuals";
import { createStore } from "./createStore";

export type VisualStatus = "onscreen" | "tucked" | "cleared";
export type VisualSource = "director" | "prepared" | "command" | "manual" | "test";

export interface VisualInstance {
  id: string;
  title: string;
  aliases: string[];
  visual: ResolvedVisual;
  /** The spec it was resolved from (null for built-in test visuals). */
  spec: VisualSpec | null;
  status: VisualStatus;
  frame: Rect;
  scale: number;
  slot: Slot | "custom";
  userPlaced: boolean;
  expanded: boolean;
  reveal: number;
  target: string | null;
  dragging: boolean;
  source: VisualSource;
  beat: string;
  createdAt: number;
  shownAt: number;
}

export type Section = "live" | "data" | "notes" | "rehearsal" | "settings";

export interface StageLink {
  connected: boolean;
  camera: string;
  size: { w: number; h: number } | null;
  lastHello: number;
}

export interface ControlState {
  section: Section;
  visuals: Record<string, VisualInstance>;
  /** On-screen visual ids, oldest first. At most two. */
  onStage: string[];
  /** Tucked visual ids, oldest first. */
  chips: string[];
  nextVisualNumber: number;
  glass: GlassTheme;
  cameraDeviceId: string | null;
  reducedMotion: boolean;
  keepOut: Rect | null;
  stage: StageLink;
  /** Loaded data. The only source of numbers on screen. */
  tables: DataTable[];
}

export const store = createStore<ControlState>({
  section: "live",
  visuals: {},
  onStage: [],
  chips: [],
  nextVisualNumber: 1,
  glass: "light",
  cameraDeviceId: null,
  reducedMotion: false,
  keepOut: null,
  stage: { connected: false, camera: "unknown", size: null, lastHello: 0 },
  tables: [],
});
