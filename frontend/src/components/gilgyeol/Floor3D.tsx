"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ParsedGraph } from "@/lib/gilgyeol/api";
import { C } from "@/lib/gilgyeol/data";
import { fallbackOutlines, snapOutlines } from "@/lib/gilgyeol/geometry";
import type { GraphNode } from "@/lib/gilgyeol/types";

export type Floor3DLevel = {
  /** Shown as a tag on the floor slab, e.g. "1F". */
  label: string;
  g: ParsedGraph;
  /** Node ids of the route on this floor, in walking order. Floors are joined at their elevators. */
  route?: string[];
};

/** A tappable pin on a node (start choices). `id` is reported to onSelect and highlighted when `selected`. */
export type Floor3DMarker = { id: string; level: number; nodeId: string };

const NO_MARKERS: Floor3DMarker[] = []; // stable default: a fresh [] would rebuild the scene on every render
const S = 0.1; // editor units -> world units
const GAP = 16; // world units between stacked floors (a floor is ~25 units wide after scaling)
const WALL_H = 1.1; // low "cutaway" walls so you can see into rooms
const SHAFT_H = 2.4; // elevator shaft stands taller
const WALL_T = 0.16;
const DOOR_W = 1.2;
const FLOOR: Record<string, string> = { room: "#F3EBDD", restroom: "#D6E6F3", stairs: "#E1E9F3", elevator_hall: "#E4DEF5" };

/** Room number / name as a camera-facing sprite. */
function label(text: string, color: string, bg: string | null, scale: number) {
  const pad = 14;
  const font = "700 44px -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  ctx.font = font;
  c.width = Math.ceil(ctx.measureText(text).width) + pad * 2;
  c.height = 64;
  ctx.font = font;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, c.width, c.height, 18);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set((c.width / c.height) * scale, scale, 1);
  sprite.renderOrder = 10;
  return sprite;
}

const shortLabel = (n: GraphNode) =>
  n.type === "room" ? n.label.replace(/\s*호(?=$|\s*\()/, "").replace(/\s*\(?화장실\)?/, " 화장실").slice(0, 8) : n.type === "stairs" ? "계단" : "승강기";

/** Box between two points on the floor (a corridor strip). */
function strip(a: THREE.Vector3, b: THREE.Vector3, width: number, mat: THREE.Material) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(len + width, 0.06, width), mat);
  m.position.set((a.x + b.x) / 2, 0.03, (a.z + b.z) / 2);
  m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
  return m;
}

type V2 = { x: number; z: number };

/** Wall box from a to b on the floor plane. */
function wallGeo(a: V2, b: V2, h: number) {
  const g = new THREE.BoxGeometry(Math.hypot(b.x - a.x, b.z - a.z) + WALL_T, h, WALL_T);
  g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
  g.translate((a.x + b.x) / 2, h / 2, (a.z + b.z) / 2);
  return g;
}

/** Walls along a closed outline, with a door gap on the wall nearest `door` (the corridor point it opens onto). */
function wallsWithDoor(poly: V2[], door: V2 | null, h: number): THREE.BufferGeometry[] {
  let doorEdge = -1;
  let doorT = 0;
  if (door) {
    let best = Infinity;
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const [ex, ez] = [b.x - a.x, b.z - a.z];
      const t = Math.min(1, Math.max(0, ((door.x - a.x) * ex + (door.z - a.z) * ez) / (ex * ex + ez * ez || 1)));
      const d = Math.hypot(a.x + ex * t - door.x, a.z + ez * t - door.z);
      if (d < best) [best, doorEdge, doorT] = [d, i, t];
    });
  }
  return poly.flatMap((a, i) => {
    const b = poly[(i + 1) % poly.length];
    if (i !== doorEdge) return [wallGeo(a, b, h)];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const gap = Math.min(DOOR_W, len * 0.6);
    const c = Math.min(len - gap / 2, Math.max(gap / 2, doorT * len));
    const at = (d: number) => ({ x: a.x + ((b.x - a.x) * d) / len, z: a.z + ((b.z - a.z) * d) / len });
    return [c - gap / 2 > 0.05 ? wallGeo(a, at(c - gap / 2), h) : null, len - c - gap / 2 > 0.05 ? wallGeo(at(c + gap / 2), b, h) : null].filter(
      (g): g is THREE.BoxGeometry => g !== null,
    );
  });
}

const bbox = (poly: V2[]) => {
  const xs = poly.map((p) => p.x);
  const zs = poly.map((p) => p.z);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
};

/** A flight of steps rising along the stair room's long side. */
function stepsGeo(poly: V2[]): THREE.BufferGeometry[] {
  const { x0, x1, z0, z1 } = bbox(poly);
  const alongX = x1 - x0 >= z1 - z0;
  const [len, wid] = alongX ? [x1 - x0, z1 - z0] : [z1 - z0, x1 - x0];
  const N = 8;
  return Array.from({ length: N }, (_, i) => {
    const h = (i + 1) * 0.13;
    const g = new THREE.BoxGeometry(alongX ? (len / N) * 0.96 : wid * 0.8, h, alongX ? wid * 0.8 : (len / N) * 0.96);
    const off = (i + 0.5) * (len / N);
    g.translate(alongX ? x0 + off : (x0 + x1) / 2, h / 2, alongX ? (z0 + z1) / 2 : z0 + off);
    return g;
  });
}

/** Rows of desks for a classroom-sized room (nothing in small rooms); the top band stays free for the name. */
function desksGeo(poly: V2[]): THREE.BufferGeometry[] {
  const { x0, x1, z0, z1 } = bbox(poly);
  const m = 0.9;
  const top = 1.7; // label band
  if ((x1 - x0) * (z1 - z0) < 28 || x1 - x0 < 2 * m + 1 || z1 - z0 < top + m + 1) return [];
  const out: THREE.BufferGeometry[] = [];
  // ponytail: plain grid in the room's bounding box; fine for the rectangular rooms the prompt asks for
  for (let x = x0 + m; x <= x1 - m && out.length < 36; x += 1.25)
    for (let z = z0 + top; z <= z1 - m && out.length < 36; z += 1.05) {
      const g = new THREE.BoxGeometry(0.78, 0.4, 0.42);
      g.translate(x, 0.2, z);
      out.push(g);
    }
  return out;
}

/** Text painted flat on a floor, fitted inside `maxW` × `maxH` world units. */
function floorText(text: string, maxW: number, maxH: number, color: string) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const font = "800 56px -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
  ctx.font = font;
  c.width = Math.ceil(ctx.measureText(text).width) + 16;
  c.height = 72;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 8, c.height / 2 + 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const aspect = c.width / c.height;
  const w = Math.min(maxW, aspect * maxH);
  const geo = new THREE.PlaneGeometry(w, w / aspect);
  geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
}

/**
 * Extruded floor plans from the AI graph (room/stair/elevator outlines), stacked when there are
 * several floors and joined at the elevator, with an optional route tube and a moving dot.
 * Renders only when the view changes (or while the route dot moves). Falls back to `fallback` without WebGL.
 */
export default function Floor3D({
  levels,
  markers = NO_MARKERS,
  selected = null,
  onSelect,
  fallback = null,
  hint = "한 손가락으로 돌리기 · 두 손가락으로 확대",
  heading = null,
}: {
  levels: Floor3DLevel[];
  markers?: Floor3DMarker[];
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  fallback?: ReactNode;
  hint?: string;
  /** Compass heading (0 = north = map up). Shows a facing cone in front of the person when known. */
  heading?: number | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const meshes = useRef(new Map<string, THREE.Mesh>());
  const redraw = useRef<() => void>(() => {});
  const selectRef = useRef(onSelect);
  const applySelection = useRef<() => void>(() => {});
  const coneRef = useRef<THREE.Mesh | null>(null);
  // Client-only component (loaded with ssr: false), so the WebGL probe can run on first render.
  const [failed] = useState(() => {
    const c = document.createElement("canvas");
    return !(c.getContext("webgl2") ?? c.getContext("webgl"));
  });

  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const el = box.current;
    if (!el || failed) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // context refused after the probe passed (rare): leave the box empty
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#c9c4b8", 2.2));
    const sun = new THREE.DirectionalLight("#ffffff", 1.4);
    sun.position.set(-20, 40, 25);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.maxPolarAngle = 1.35;
    controls.minDistance = 4;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    meshes.current.clear();
    const pickable: THREE.Object3D[] = [];
    const mat = (color: string, opacity = 1) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, transparent: opacity < 1, opacity });
    const edgeMat = new THREE.LineBasicMaterial({ color: "#B9B3A6" });
    const corridorMat = mat("#FFFFFF");
    const routeStops: THREE.Vector3[] = [];

    // Align every floor's elevator over the first floor's, so the shaft is straight.
    const elevOf = (g: ParsedGraph) => g.nodes.find((n) => n.type === "elevator_hall");
    const base = elevOf(levels[0]?.g ?? ({ nodes: [] } as unknown as ParsedGraph));
    // Graphs come in arbitrary units (photo fractions), so scale each floor until a typical room is ~7 m wide.
    // That keeps desks, doors and stacked floors at one real-world size.
    // Rooms without an AI outline get an estimated rectangle first, so scale, walls and labels all work.
    const filled = levels.map(({ g }) => fallbackOutlines(g.nodes, g.edges));
    const scales = levels.map((_, li) => {
      const sides = filled[li]
        .filter((n) => n.type === "room" && n.outline && n.outline.length >= 3)
        .map((n) => Math.max(Math.max(...n.outline!.map((p) => p.x)) - Math.min(...n.outline!.map((p) => p.x)), Math.max(...n.outline!.map((p) => p.y)) - Math.min(...n.outline!.map((p) => p.y))))
        .sort((a, b) => a - b);
      // No upper clamp: verified graphs are 0–1 photo fractions (rooms ~0.15 wide), which need ~350x.
      return sides.length ? (S * 70) / sides[Math.floor(sides.length / 2)] : S;
    });

    levels.forEach((level, li) => {
      const LS = scales[li];
      const nodes = snapOutlines(filled[li]);
      const elev = elevOf(level.g);
      const dx = base && elev ? base.x * scales[0] - elev.x * LS : 0;
      const dz = base && elev ? base.y * scales[0] - elev.y * LS : 0;
      const group = new THREE.Group();
      group.position.set(dx, li * GAP, dz);
      scene.add(group);
      const at = new Map(nodes.map((n) => [n.id, n]));
      const v = (n: { x: number; y: number }, y = 0) => new THREE.Vector3(n.x * LS, y, n.y * LS);

      // Floor slab under everything this floor covers.
      const pts = nodes.flatMap((n) => [n, ...(n.outline ?? [])]);
      if (pts.length) {
        const [x0, x1] = [Math.min(...pts.map((p) => p.x)) * LS - 1.5, Math.max(...pts.map((p) => p.x)) * LS + 1.5];
        const [z0, z1] = [Math.min(...pts.map((p) => p.y)) * LS - 1.5, Math.max(...pts.map((p) => p.y)) * LS + 1.5];
        // Upper slabs are see-through so lower floors and the elevator shaft stay visible.
        const slab = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.3, z1 - z0), mat("#ECE9E1", li === 0 ? 1 : 0.5));
        slab.position.set((x0 + x1) / 2, -0.16, (z0 + z1) / 2);
        group.add(slab);
        const tag = label(level.label, "#ffffff", C.ink, 1.1);
        tag.position.set(x0 + 1.2, 0.6, z0 + 0.8);
        group.add(tag);
      }

      // Corridors: edges with no room at either end.
      for (const e of level.g.edges) {
        const [a, b] = [at.get(e.a), at.get(e.b)];
        if (a && b && a.type !== "room" && b.type !== "room") group.add(strip(v(a), v(b), 1.1, corridorMat));
      }

      // Rooms, stairs and elevators as a cutaway: coloured floor, low walls with a door onto the corridor,
      // steps in stair rooms, desks in classroom-sized rooms, the name painted on the floor.
      const walls: THREE.BufferGeometry[] = [];
      const shafts: THREE.BufferGeometry[] = [];
      const steps: THREE.BufferGeometry[] = [];
      const desks: THREE.BufferGeometry[] = [];
      const polyOf = (n: GraphNode): V2[] =>
        n.outline && n.outline.length >= 3
          ? n.outline.map((p) => ({ x: p.x * LS, z: p.y * LS }))
          : [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]].map(([ox, oz]) => ({ x: n.x * LS + ox, z: n.y * LS + oz }));
      const roomish = nodes.filter((n) => n.type === "room" || n.type === "stairs" || n.type === "elevator_hall");
      // Label centres, so a name is never wider than the gap to its neighbour's name.
      const centres = roomish.map((n) => {
        const b = bbox(polyOf(n));
        return { id: n.id, x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, b };
      });
      /** Distance to the nearest room in line along `axis`: one whose span on the other axis overlaps ours by half. */
      const gap = (id: string, axis: "x" | "z") => {
        const me = centres.find((c) => c.id === id)!;
        const [lo, hi] = axis === "x" ? (["z0", "z1"] as const) : (["x0", "x1"] as const);
        const ds = centres
          .filter((c) => {
            if (c.id === id) return false;
            const overlap = Math.min(c.b[hi], me.b[hi]) - Math.max(c.b[lo], me.b[lo]);
            return overlap > 0.5 * Math.min(c.b[hi] - c.b[lo], me.b[hi] - me.b[lo]);
          })
          .map((c) => Math.abs(c[axis] - me[axis]));
        return ds.length ? Math.min(...ds) : Infinity;
      };
      for (const n of roomish) {
        const poly = polyOf(n);
        const doorNode = level.g.edges.map((e) => (e.a === n.id ? e.b : e.b === n.id ? e.a : null)).map((id) => (id ? at.get(id) : undefined)).find((x) => x && x.type !== "room");
        const restroom = n.type === "room" && /화장실/.test(n.label);
        const kind = restroom ? "restroom" : n.type;

        const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, -p.z)));
        const floorGeo = new THREE.ShapeGeometry(shape);
        floorGeo.rotateX(-Math.PI / 2);
        floorGeo.translate(0, 0.03, 0);
        const plate = new THREE.Mesh(floorGeo, mat(FLOOR[kind] ?? FLOOR.room));
        plate.userData.id = n.id;
        group.add(plate);
        pickable.push(plate);
        meshes.current.set(n.id, plate);

        const door = doorNode ? { x: doorNode.x * LS, z: doorNode.y * LS } : null;
        (n.type === "elevator_hall" ? shafts : walls).push(...wallsWithDoor(poly, door, n.type === "elevator_hall" ? SHAFT_H : WALL_H));
        if (n.type === "stairs") steps.push(...stepsGeo(poly));
        // Desks only in the single-floor view; stacked views are about the route, and stay light.
        // Estimated outlines are only a size guess: no desks, so the painted name stays readable.
        const roomDesks = n.type === "room" && !restroom && !n.outlineEstimated && levels.length === 1 ? desksGeo(poly) : [];
        desks.push(...roomDesks);

        const { x0, x1, z0, z1 } = bbox(poly);
        // Tall, narrow rooms (406–402) carry the name along their long side, like a printed plan.
        const tall = z1 - z0 > (x1 - x0) * 1.4;
        const [along, across] = tall ? [z1 - z0, x1 - x0] : [x1 - x0, z1 - z0];
        // Floors keep labels readable even in a cramped row (a tiny label is worse than a slight overlap).
        const maxW = Math.max(0.6, Math.min(along * 0.85, gap(n.id, tall ? "z" : "x") * 0.9));
        const maxH = Math.max(0.35, Math.min(across * (tall ? 0.6 : 0.32), gap(n.id, tall ? "x" : "z") * 0.8, 1.1));
        const text = floorText(n.type === "room" ? shortLabel(n) : n.type === "stairs" ? "계단" : "승강기", maxW, maxH, restroom ? C.route : C.ink);
        if (tall) text.rotation.y = -Math.PI / 2; // reads bottom-to-top from the default view
        // Stairs: name above the top step. Classrooms with desks: name in the band by the top wall. Else: centre.
        text.position.set((x0 + x1) / 2, n.type === "stairs" ? 1.12 : 0.07, roomDesks.length && !tall ? z0 + 0.85 : (z0 + z1) / 2);
        text.renderOrder = 5;
        group.add(text);
      }
      const merged = (geos: THREE.BufferGeometry[], material: THREE.Material, edges: boolean) => {
        if (!geos.length) return;
        const g = mergeGeometries(geos);
        geos.forEach((x) => x.dispose());
        group.add(new THREE.Mesh(g, material));
        if (edges) group.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), edgeMat));
      };
      merged(walls, mat("#FFFFFF"), true);
      merged(shafts, mat("#CFC6EF", 0.85), true);
      merged(steps, mat("#C3D3E6"), true);
      merged(desks, mat("#B89C77"), false);

      // Exits: a green door frame.
      for (const n of nodes.filter((x) => x.type === "exit")) {
        const frame = [wallGeo({ x: n.x * LS - 0.6, z: n.y * LS }, { x: n.x * LS - 0.6, z: n.y * LS + 0.01 }, 1.9), wallGeo({ x: n.x * LS + 0.6, z: n.y * LS }, { x: n.x * LS + 0.6, z: n.y * LS + 0.01 }, 1.9)];
        const top = new THREE.BoxGeometry(1.36, 0.16, WALL_T);
        top.translate(n.x * LS, 1.9, n.y * LS);
        group.add(new THREE.Mesh(mergeGeometries([...frame, top]), mat(C.success)));
      }

      // The user: a small person on 현위치 (single floor) or at the route's start (stacked), with a ground ring,
      // and a heading cone when the screen knows the compass heading.
      const cur = level.g.current_node_id ? at.get(level.g.current_node_id) : undefined;
      const me = levels.length === 1 ? cur : li === 0 && level.route?.[0] ? at.get(level.route[0]) : undefined;
      if (me) {
        const person = new THREE.Group();
        person.position.copy(v(me));
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.5, 6, 14), mat(C.brand));
        body.position.y = 0.6;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 14), mat("#F1D7C4"));
        head.position.y = 1.28;
        const ringGeo = new THREE.RingGeometry(0.5, 0.68, 36);
        ringGeo.rotateX(-Math.PI / 2);
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: C.warning, transparent: true, opacity: 0.85 }));
        ring.position.y = 0.06;
        const tag = label("현위치", "#ffffff", C.warning, 0.75);
        tag.position.y = 2.05;
        const coneGeo = new THREE.CircleGeometry(3, 24, Math.PI / 2 - 0.5, 1);
        coneGeo.rotateX(-Math.PI / 2);
        const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: C.route, transparent: true, opacity: 0.38, depthWrite: false }));
        cone.position.y = 0.12; // above floor plates and corridor strips
        cone.visible = false;
        coneRef.current = cone;
        person.add(body, head, ring, tag, cone);
        group.add(person);
      }

      // Start-choice markers (tappable).
      for (const mk of markers.filter((m) => m.level === li)) {
        const n = at.get(mk.nodeId);
        if (!n) continue;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.25, 28), mat(C.ink));
        m.position.copy(v(n, 0.2));
        m.userData = { id: mk.id, marker: true };
        group.add(m);
        pickable.push(m);
        meshes.current.set(mk.id, m);
      }

      // Route stops in world space, walking order.
      for (const id of level.route ?? []) {
        const n = at.get(id);
        if (n) routeStops.push(v(n, 0.35).add(group.position));
      }
    });

    // Elevator shaft through every floor (floors were aligned on it above).
    if (levels.length > 1 && base) {
      const h = (levels.length - 1) * GAP + SHAFT_H;
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.4, h, 1.4), new THREE.MeshStandardMaterial({ color: C.haptic, transparent: true, opacity: 0.32, depthWrite: false }));
      shaft.position.set(base.x * scales[0], h / 2, base.y * scales[0]);
      scene.add(shaft);
    }

    // Route tube + a dot that walks it.
    let dot: THREE.Mesh | null = null;
    let curve: THREE.CurvePath<THREE.Vector3> | null = null;
    if (routeStops.length >= 2) {
      curve = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 1; i < routeStops.length; i++) curve.add(new THREE.LineCurve3(routeStops[i - 1], routeStops[i]));
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.max(32, routeStops.length * 12), 0.16, 8, false),
        new THREE.MeshStandardMaterial({ color: C.route, emissive: C.route, emissiveIntensity: 0.35 }),
      );
      scene.add(tube);
      dot = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: C.route, emissiveIntensity: 0.6 }));
      scene.add(dot);
      const end = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), mat(C.brand));
      end.position.copy(routeStops.at(-1)!);
      scene.add(end);
    }

    // Frame the whole scene from a 3/4 angle; the narrower of the two fields of view decides the distance.
    const sphere = new THREE.Box3().setFromObject(scene).getBoundingSphere(new THREE.Sphere());
    // Stacked floors get a lower angle so each floor reads as its own layer.
    const view = new THREE.Vector3(-0.4, levels.length > 1 ? 0.42 : 1.15, 0.75).normalize(); // single floor: steeper, plan-like
    let touched = false;
    controls.addEventListener("start", () => (touched = true));
    const frameAll = () => {
      const vfov = THREE.MathUtils.degToRad(camera.fov);
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
      const dist = (sphere.radius / Math.sin(Math.min(vfov, hfov) / 2)) * 0.7; // a flat floor fills far less than its bounding sphere
      camera.position.copy(sphere.center).addScaledVector(view, dist);
      controls.target.copy(sphere.center);
      controls.maxDistance = dist * 2.5;
      controls.update();
    };

    const render = () => renderer.render(scene, camera);
    redraw.current = render;
    applySelection.current(); // a rebuild starts with fresh materials
    controls.addEventListener("change", render);

    const resize = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = `${width}px`;
      renderer.domElement.style.height = `${height}px`;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (!touched) frameAll(); // re-fit until the user moves the camera themselves
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // The route dot is the only thing that animates; nothing else renders between gestures.
    let raf = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (dot && curve) {
      if (reduce) {
        dot.position.copy(curve.getPointAt(0.5));
        render();
      } else {
        const t0 = performance.now();
        const tick = (t: number) => {
          dot!.position.copy(curve!.getPointAt(((t - t0) / 6000) % 1));
          render();
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }
    }

    // Tap (no drag) picks a room or marker.
    const ray = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(pickable, false)[0];
      selectRef.current?.((hit?.object.userData.id as string | undefined) ?? null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((x) => {
          (x as THREE.SpriteMaterial).map?.dispose();
          x.dispose();
        });
      });
      renderer.dispose();
      renderer.domElement.remove();
      redraw.current = () => {};
    };
  }, [levels, markers, failed]);

  // Selection only recolours; no rebuild. Also re-applied after each rebuild (fresh materials).
  useEffect(() => {
    applySelection.current = () =>
      meshes.current.forEach((m, id) => {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (m.userData.marker) mat.color.set(id === selected ? C.brand : C.ink);
        else {
          mat.emissive.set(id === selected ? C.brand : "#000000");
          mat.emissiveIntensity = id === selected ? 0.45 : 0;
        }
      });
    applySelection.current();
    redraw.current();
  }, [selected]);

  // Heading only turns the cone; no rebuild.
  useEffect(() => {
    const cone = coneRef.current;
    if (!cone) return;
    cone.visible = heading !== null;
    if (heading !== null) cone.rotation.y = -THREE.MathUtils.degToRad(heading);
    redraw.current();
  }, [heading, levels]);

  if (failed) return <>{fallback}</>;
  return (
    <div className="relative size-full">
      <div ref={box} className="absolute inset-0" role="img" aria-label="3D 층 지도. 한 손가락으로 돌리고 두 손가락으로 확대해요" />
      <div className="pointer-events-none absolute top-3 left-3 rounded-lg bg-white/90 px-2.5 py-1.5 text-[12px] font-semibold text-muted">{hint}</div>
    </div>
  );
}
