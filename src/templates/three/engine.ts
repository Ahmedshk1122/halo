// Renders a live 3D model (shared/scene3d.ts parts) with three.js: soft studio
// light, a gentle sway so viewers see it from several sides, parts that grow in
// as they stream, an exploded view, part motion, and callout labels on the
// sides with leader lines. Transparent background, so it floats on the video.
// Loaded on demand, only when a 3D visual first appears.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { SceneObject, SceneSettings, View3D } from "../../../shared/scene3d";

/** Concrete colors for the palette names (the design system's system colors). */
const COLORS: Record<string, number> = {
  blue: 0x0a84ff,
  accent: 0x0a84ff,
  green: 0x30d158,
  red: 0xff453a,
  orange: 0xff9f0a,
  yellow: 0xffd60a,
  teal: 0x40cbe0,
  indigo: 0x5e5ce6,
  purple: 0xbf5af2,
  pink: 0xff375f,
  brown: 0xac8e68,
  gray: 0x8e8e93,
  white: 0xf2f2f7,
  black: 0x2c2c2e,
  ink: 0xd1d1d6,
  "ink-2": 0xaeaeb2,
  "ink-3": 0x8e8e93,
  fill: 0xaeaeb2,
  "fill-2": 0xc7c7cc,
};

const VIEW_DIR: Record<View3D, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0.18, 1),
  "three-quarter": new THREE.Vector3(1, 0.6, 1.25),
  side: new THREE.Vector3(1, 0.18, 0.05),
  top: new THREE.Vector3(0.05, 1, 0.35),
};

const DEG = Math.PI / 180;
/** Spin turns a part around its own axis, whatever way it was placed. */
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) } as const;

function geometryOf(o: SceneObject): THREE.BufferGeometry {
  switch (o.shape) {
    case "box": {
      const [w, h, d] = o.size;
      return new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.08);
    }
    case "sphere":
      return new THREE.SphereGeometry(o.r, 48, 32);
    case "cylinder":
      return new THREE.CylinderGeometry(o.r_top, o.r_bottom, o.h, 56);
    case "cone":
      return new THREE.ConeGeometry(o.r, o.h, 56);
    case "torus":
      return new THREE.TorusGeometry(o.r, o.tube, 24, 96);
    case "capsule":
      return new THREE.CapsuleGeometry(o.r, o.h, 10, 32);
    case "lathe":
      return new THREE.LatheGeometry(
        o.profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)),
        72,
      );
    case "tube": {
      const curve = new THREE.CatmullRomCurve3(o.path.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
      return new THREE.TubeGeometry(curve, Math.max(32, o.path.length * 12), o.r, 16, false);
    }
    case "extrude": {
      const shape = new THREE.Shape(o.profile.map(([x, y]) => new THREE.Vector2(x, y)));
      const bevel = Math.min(0.06, o.depth * 0.15);
      const g = new THREE.ExtrudeGeometry(shape, { depth: o.depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 });
      g.translate(0, 0, -o.depth / 2);
      return g;
    }
  }
}

function materialOf(o: SceneObject): THREE.Material {
  const color = COLORS[o.color] ?? COLORS.gray;
  const base = { color, transparent: o.opacity < 1, opacity: o.opacity };
  switch (o.material) {
    case "matte":
      return new THREE.MeshStandardMaterial({ ...base, roughness: 0.9, metalness: 0 });
    case "metal":
      return new THREE.MeshStandardMaterial({ ...base, roughness: 0.3, metalness: 0.9 });
    case "glass":
      return new THREE.MeshPhysicalMaterial({ ...base, transparent: true, opacity: Math.min(o.opacity, 0.35), roughness: 0.05, metalness: 0, clearcoat: 1 });
    case "glow":
      return new THREE.MeshStandardMaterial({ ...base, emissive: color, emissiveIntensity: 1.1, roughness: 0.5 });
    default:
      return new THREE.MeshStandardMaterial({ ...base, roughness: 0.45, metalness: 0.1 });
  }
}

interface Part {
  obj: SceneObject;
  mesh: THREE.Mesh;
  base: THREE.Vector3;
  born: number;
  label: HTMLDivElement | null;
  side: "left" | "right";
}

export interface Engine {
  update(objects: SceneObject[], settings: SceneSettings): void;
  dispose(): void;
}

export function createEngine(host: HTMLElement, labels: HTMLElement, leaders: SVGSVGElement, size: { w: number; h: number }, reduce: boolean): Engine {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(size.w, size.h);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // A touch under neutral, so light metal keeps its shape against a bright wall.
  renderer.toneMappingExposure = 0.85;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a44, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(6, 9, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.9);
  rim.position.set(-7, 3, -6);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(30, size.w / size.h, 0.1, 1000);
  const root = new THREE.Group();
  scene.add(root);

  const parts = new Map<string, Part>();
  let settings: SceneSettings = { view: "three-quarter", exploded: false, turntable: true };
  let explode = 0;
  let distance = 30;
  let targetDistance = 30;
  const center = new THREE.Vector3();
  const targetCenter = new THREE.Vector3();
  const svgNS = "http://www.w3.org/2000/svg";

  const refit = () => {
    // Fit the assembled model (or the exploded one when exploded), leaving the sides for callouts.
    const box = new THREE.Box3();
    for (const p of parts.values()) {
      const b = new THREE.Box3().setFromObject(p.mesh);
      if (settings.exploded) b.translate(new THREE.Vector3(...p.obj.explode).multiplyScalar(1 - explode));
      box.union(b);
    }
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    targetCenter.copy(sphere.center);
    const fov = (camera.fov * DEG) / 2;
    const fit = Math.max(sphere.radius / Math.sin(fov), sphere.radius / Math.sin(Math.atan(Math.tan(fov) * camera.aspect)));
    targetDistance = fit * 1.12;
  };

  const update = (objects: SceneObject[], next: SceneSettings) => {
    settings = next;
    const keep = new Set(objects.map((o) => o.key));
    for (const [k, p] of parts) {
      if (keep.has(k)) continue;
      root.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
      p.label?.remove();
      parts.delete(k);
    }
    const now = performance.now();
    objects.forEach((o) => {
      if (parts.has(o.key)) return;
      const mesh = new THREE.Mesh(geometryOf(o), materialOf(o));
      mesh.position.set(...o.pos);
      mesh.rotation.set(o.rot[0] * DEG, o.rot[1] * DEG, o.rot[2] * DEG);
      root.add(mesh);
      let label: HTMLDivElement | null = null;
      if (o.label) {
        label = document.createElement("div");
        label.className = "tpl-model-label";
        label.textContent = o.label;
        labels.appendChild(label);
      }
      parts.set(o.key, { obj: o, mesh, base: new THREE.Vector3(...o.pos), born: reduce ? 0 : now, label, side: o.pos[0] < 0 ? "left" : "right" });
    });
    refit();
  };

  const anchor = new THREE.Vector3();
  let raf = 0;
  let last = performance.now();
  const start = last;
  const frame = (t: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    const since = (t - start) / 1000;

    explode += ((settings.exploded ? 1 : 0) - explode) * Math.min(1, dt * 3);
    distance += (targetDistance - distance) * Math.min(1, dt * 2.5);
    center.lerp(targetCenter, Math.min(1, dt * 2.5));
    // A gentle sway rather than a full turn keeps labelled parts facing the viewer.
    root.rotation.y = settings.turntable && !reduce ? Math.sin((since * 2 * Math.PI) / 26) * 0.6 : 0;

    for (const p of parts.values()) {
      const grow = p.born ? Math.min(1, (t - p.born) / 450) : 1;
      const e = 1 - (1 - grow) ** 3;
      p.mesh.position.copy(p.base).addScaledVector(new THREE.Vector3(...p.obj.explode), explode);
      let s = 0.85 + 0.15 * e;
      const [kind, a, b] = p.obj.anim.split(" ");
      if (!reduce && kind === "spin") {
        p.mesh.rotateOnAxis(AXES[a as "x" | "y" | "z"], (dt * 2 * Math.PI) / Number(b));
      } else if (!reduce && kind === "pulse") {
        s *= 1 + 0.05 * Math.max(0, Math.sin((since * 2 * Math.PI) / Number(a)));
      } else if (!reduce && kind === "bob") {
        p.mesh.position.y += Math.sin((since * 2 * Math.PI) / Number(a)) * 0.15;
      }
      p.mesh.scale.setScalar(s);
      const m = p.mesh.material as THREE.MeshStandardMaterial;
      m.transparent = grow < 1 || p.obj.opacity < 1 || p.obj.material === "glass";
      if (grow < 1) m.opacity = p.obj.opacity * e;
    }

    const dir = VIEW_DIR[settings.view].clone().normalize();
    camera.position.copy(center).addScaledVector(dir, distance);
    camera.lookAt(center);
    renderer.render(scene, camera);
    placeLabels();
  };

  /** The model's outline on screen, from its bounding box corners. */
  const screenBounds = () => {
    const box = new THREE.Box3();
    for (const p of parts.values()) box.union(new THREE.Box3().setFromObject(p.mesh));
    const out = { left: size.w, right: 0, top: size.h, bottom: 0 };
    if (box.isEmpty()) return { left: size.w / 2, right: size.w / 2, top: size.h / 2, bottom: size.h / 2 };
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
      const x = (c.x * 0.5 + 0.5) * size.w;
      const y = (-c.y * 0.5 + 0.5) * size.h;
      out.left = Math.min(out.left, x);
      out.right = Math.max(out.right, x);
      out.top = Math.min(out.top, y);
      out.bottom = Math.max(out.bottom, y);
    }
    return out;
  };

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  /**
   * Callouts just outside the model's outline, on the side their part is on, with
   * a leader line to it. A part hidden inside the model has its label hidden too,
   * until the exploded view (or the turn) brings it into sight.
   */
  const placeLabels = () => {
    const bounds = screenBounds();
    const mid = (bounds.left + bounds.right) / 2;
    const meshes = [...parts.values()].map((p) => p.mesh);
    const columns: Record<"left" | "right", { p: Part; x: number; y: number }[]> = { left: [], right: [] };
    for (const p of parts.values()) {
      if (!p.label) continue;
      p.mesh.getWorldPosition(anchor);
      anchor.project(camera);
      ndc.set(anchor.x, anchor.y);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(meshes, false)[0];
      const seen = !hit || hit.object === p.mesh;
      p.label.style.opacity = seen ? "1" : "0";
      if (!seen) continue;
      const x = (anchor.x * 0.5 + 0.5) * size.w;
      const y = (-anchor.y * 0.5 + 0.5) * size.h;
      // Keep a side unless the part clearly crosses over, so labels don't hop as the model sways.
      const margin = (bounds.right - bounds.left) * 0.12;
      if (p.side === "left" && x > mid + margin) p.side = "right";
      else if (p.side === "right" && x < mid - margin) p.side = "left";
      columns[p.side].push({ p, x, y });
    }
    while (leaders.firstChild) leaders.removeChild(leaders.firstChild);
    for (const side of ["left", "right"] as const) {
      const list = columns[side].sort((a, b) => a.y - b.y);
      const gap = 36;
      let next = 18;
      for (const l of list) {
        const el = l.p.label!;
        const ly = Math.min(size.h - 18, Math.max(next, l.y));
        next = ly + gap;
        const w = el.offsetWidth;
        const lx = side === "left" ? Math.max(0, bounds.left - 14 - w) : Math.min(size.w - w, bounds.right + 14);
        el.style.top = `${ly}px`;
        el.style.left = `${lx}px`;
        const edge = side === "left" ? lx + w + 6 : lx - 6;
        const line = document.createElementNS(svgNS, "path");
        line.setAttribute("d", `M${edge} ${ly} L${l.x} ${l.y}`);
        line.setAttribute("class", "tpl-model-leader");
        leaders.appendChild(line);
        const dot = document.createElementNS(svgNS, "circle");
        dot.setAttribute("cx", String(l.x));
        dot.setAttribute("cy", String(l.y));
        dot.setAttribute("r", "4");
        dot.setAttribute("class", "tpl-model-dot");
        leaders.appendChild(dot);
      }
    }
  };

  raf = requestAnimationFrame(frame);

  return {
    update,
    dispose() {
      cancelAnimationFrame(raf);
      for (const p of parts.values()) {
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        p.label?.remove();
      }
      parts.clear();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
