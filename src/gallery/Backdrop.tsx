// Stand-in for a webcam feed in /gallery, so glass can be judged against a real-looking room.
export type BackdropKind = "room" | "dusk" | "camera";

export function Backdrop({ kind }: { kind: Exclude<BackdropKind, "camera"> }) {
  return (
    <div className={`gallery-backdrop is-${kind}`} aria-hidden>
      <div className="gb-window" />
      <div className="gb-shelf" />
      <div className="gb-plant" />
      <div className="gb-person">
        <div className="gb-hair" />
        <div className="gb-face" />
        <div className="gb-neck" />
        <div className="gb-body" />
      </div>
    </div>
  );
}

/** Where the sample person's face sits, in stage coordinates (for keep-out). */
export const BACKDROP_FACE = { x: 800, y: 210, w: 320, h: 420 };
