// All Halo state lives here, in the control window. The stage window only
// renders the StageState derived from it.

import type { DataTable } from "../../shared/data";
import type { DirectorAction, Proactivity } from "../../shared/director";
import type { Rect } from "../../shared/geometry";
import type { Slot } from "../../shared/layout";
import type { GlassTheme } from "../../shared/stage";
import type { SpokenNumber } from "../../shared/spoken";
import type { ResolvedVisual, TemplateId, VisualSpec } from "../../shared/visuals";
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
  /** Speech after this time counts toward revealing items by their cues. */
  cueFrom: number;
  /** Director visuals: reveal anything still hidden at this time (its items were already said). */
  revealDeadline: number | null;
  /** Words spoken when the last item was revealed (prepared visuals fall back to pacing). */
  wordsAtReveal: number;
  /** Goal cards can be grown by a raised pointing hand until this time. */
  growableUntil?: number;
}

export interface TranscriptEntry {
  id: number;
  text: string;
  at: number;
  startedAt: number;
  /** Rehearsal beat label, if any. */
  label?: string;
  /** Voice command handled locally, if any. */
  command?: string;
}

export type DecisionTrigger = "final" | "interim" | "command" | "request";
export type DecisionOutcome = "applied" | "none" | "dropped" | "deferred" | "superseded" | "error" | "pending";

export interface DecisionEntry {
  id: number;
  at: number;
  trigger: DecisionTrigger;
  source: "claude" | "replay" | "command";
  action: DirectorAction | "error";
  outcome: DecisionOutcome;
  reason: string;
  beat: string;
  /** Rehearsal beat label of the speech that triggered it. */
  label?: string;
  said: string;
  visualId?: string;
  title?: string;
  template?: TemplateId;
  errors?: string[];
  speechEndAt: number;
  requestMs?: number;
  modelMs?: number;
  /** End of speech to visual on stage. */
  onScreenMs?: number;
  model?: string;
}

export interface BeatEntry {
  name: string;
  at: number;
  visualIds: string[];
}

export interface PreparedVisual {
  id: string;
  when: string;
  template: TemplateId;
  title: string;
  spec: VisualSpec;
  visual: ResolvedVisual | null;
  errors: string[];
  /** Numbers written in the notes, which count as the presenter's own words. */
  said?: SpokenNumber[];
}

export type SpeechStatus = "idle" | "starting" | "listening" | "restarting" | "error" | "unsupported";

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
  transcript: TranscriptEntry[];
  interim: { text: string; at: number; label?: string } | null;
  decisions: DecisionEntry[];
  arc: { summary: string; beat: string; beats: BeatEntry[] };
  director: {
    provider: "claude" | "replay";
    proactivity: Proactivity;
    inFlight: boolean;
    lastShowAt: number | null;
  };
  speech: { status: SpeechStatus; detail?: string; source: "live" | "rehearsal" | null };
  prepared: PreparedVisual[];
  /** Messages for data files that could not be loaded. */
  dataErrors: string[];
  /** Which model provider the local server uses (for labels). */
  ai: { provider: "anthropic" | "gemini" | null };
  hands: {
    enabled: boolean;
    status: "off" | "loading" | "running" | "error";
    detail?: string;
    /** Fingertip in the presenter's mirrored frame, for the preview overlay only. */
    pointer: { x: number; y: number; mode: "point" | "pinch" | "idle"; dwell: number } | null;
    showFaceZone: boolean;
  };
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
  transcript: [],
  interim: null,
  decisions: [],
  arc: { summary: "", beat: "", beats: [] },
  director: { provider: "claude", proactivity: "balanced", inFlight: false, lastShowAt: null },
  speech: { status: "idle", source: null },
  prepared: [],
  ai: { provider: null },
  dataErrors: [],
  hands: { enabled: true, status: "off", pointer: null, showFaceZone: false },
});
