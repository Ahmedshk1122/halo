// Ready-made backdrops for diagrams about things that are hard to draw from
// simple shapes. The AI places markers on named anchors; the drawings are
// fixed, calm outlines in the Halo style. Coordinates are 0–100 within the
// diagram's drawing area.

import type { Point } from "./geometry";

export const BACKDROP_IDS = ["none", "human_body", "race_track"] as const;
export type BackdropId = (typeof BACKDROP_IDS)[number];

export interface Backdrop {
  /** Width / height of the drawing area this backdrop is drawn for. */
  aspect: number;
  /** fill: a soft silhouette. track: a wide road with a centerline. */
  style: "fill" | "track";
  /** The diagram shape that fits this backdrop best. */
  diagramAspect: "wide" | "square" | "tall";
  /** SVG path data in a 100×100 box, drawn as soft outlines. */
  outline: string[];
  /** Faint inner shapes (organs, kerbs). */
  details: { id: string; d: string }[];
  anchors: Record<string, Point>;
}

const HUMAN_BODY: Backdrop = {
  aspect: 0.62,
  style: "fill",
  diagramAspect: "square",
  outline: [
    // Head, neck, torso with arms, and legs, as one soft silhouette.
    "M50,3 C56,3 60,8 60,14 C60,20 56,25 50,25 C44,25 40,20 40,14 C40,8 44,3 50,3 Z",
    "M45,25 L55,25 L56,29 C64,30 71,32 73,38 L80,62 C81,65 78,67 76,65 L68,42 L67,58 L66,96 C66,99 61,99 60,96 L53,63 L50,62 L47,63 L40,96 C39,99 34,99 34,96 L33,58 L32,42 L24,65 C22,67 19,65 20,62 L27,38 C29,32 36,30 44,29 Z",
  ],
  details: [
    { id: "brain", d: "M44,9 C47,6 53,6 56,9 C58,11 58,15 55,16 L45,16 C42,15 42,11 44,9 Z" },
    { id: "lungs", d: "M41,33 C44,31 47,32 48,35 L48,45 C45,47 41,46 40,43 Z M59,33 C56,31 53,32 52,35 L52,45 C55,47 59,46 60,43 Z" },
    { id: "heart", d: "M49,38 C51,36 54,37 54,40 C54,43 51,45 50,46 C48,45 46,43 46,40 C46,38 48,37 49,38 Z" },
    { id: "liver", d: "M41,47 C45,45 52,46 53,48 C52,51 46,52 41,51 Z" },
    { id: "stomach", d: "M53,47 C57,46 59,49 58,52 C57,55 53,55 52,52 Z" },
    { id: "kidneys", d: "M43,53 C44,52 45,53 45,55 C45,57 43,57 43,55 Z M57,53 C56,52 55,53 55,55 C55,57 57,57 57,55 Z" },
    { id: "intestines", d: "M43,57 C47,55 53,55 57,57 C58,61 55,64 50,64 C45,64 42,61 43,57 Z" },
  ],
  anchors: {
    head: { x: 50, y: 12 },
    brain: { x: 50, y: 11 },
    eyes: { x: 50, y: 14 },
    throat: { x: 50, y: 27 },
    shoulder_left: { x: 66, y: 32 },
    shoulder_right: { x: 34, y: 32 },
    lungs: { x: 44, y: 39 },
    heart: { x: 50, y: 41 },
    chest: { x: 50, y: 37 },
    liver: { x: 46, y: 49 },
    stomach: { x: 55, y: 50 },
    kidneys: { x: 43, y: 55 },
    intestines: { x: 50, y: 60 },
    spine: { x: 50, y: 48 },
    arm_left: { x: 72, y: 45 },
    arm_right: { x: 28, y: 45 },
    hand_left: { x: 78, y: 63 },
    hand_right: { x: 22, y: 63 },
    hip: { x: 50, y: 62 },
    knee_left: { x: 61, y: 80 },
    knee_right: { x: 39, y: 80 },
    foot_left: { x: 63, y: 97 },
    foot_right: { x: 37, y: 97 },
  },
};

const RACE_TRACK: Backdrop = {
  aspect: 1.6,
  style: "track",
  diagramAspect: "wide",
  outline: [
    // A generic circuit: long straight, hairpin, chicane and sweeping corners.
    "M14,74 L62,74 C76,74 86,70 88,60 C90,50 84,44 76,46 C68,48 66,40 72,34 C78,28 82,20 74,14 C66,8 56,12 52,20 C48,28 40,30 32,26 C24,22 12,26 10,38 C8,50 6,62 14,74 Z",
  ],
  details: [{ id: "start", d: "M20,70 L20,78" }],
  anchors: {
    start: { x: 20, y: 74 },
    main_straight: { x: 40, y: 74 },
    turn_1: { x: 84, y: 66 },
    turn_2: { x: 84, y: 50 },
    turn_3: { x: 69, y: 42 },
    turn_4: { x: 76, y: 22 },
    turn_5: { x: 60, y: 12 },
    turn_6: { x: 48, y: 26 },
    turn_7: { x: 28, y: 25 },
    turn_8: { x: 10, y: 42 },
    turn_9: { x: 10, y: 62 },
    back_straight: { x: 38, y: 28 },
    pit_lane: { x: 30, y: 80 },
  },
};

export const BACKDROPS: Record<Exclude<BackdropId, "none">, Backdrop> = {
  human_body: HUMAN_BODY,
  race_track: RACE_TRACK,
};

export function backdropAnchors(id: BackdropId): string[] {
  return id === "none" ? [] : Object.keys(BACKDROPS[id].anchors);
}
