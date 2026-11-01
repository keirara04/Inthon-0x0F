import type { ParsedGraph, Place } from "./api";
import type { ApiGraph } from "@/types/api";
import type { StartNodeId } from "./types";

export type ConfirmedMap = {
  graph: ParsedGraph;
  photo: { url: string; w: number; h: number } | null;
};
export type ConfirmedMaps = Record<string, ConfirmedMap>;

export function mapKey(place: Place, floor: string) {
  return `${place.id ?? place.name.trim().toLowerCase()}::${floor}`;
}

/** Confirmation adds one floor without replacing the other floors of the trip. */
export function rememberMap(maps: ConfirmedMaps, place: Place, graph: ParsedGraph, photo: ConfirmedMap["photo"], floor = graph.floor): ConfirmedMaps {
  return { ...maps, [mapKey(place, floor)]: { graph: { ...graph, floor }, photo } };
}

/** Match floor-prefixed route ids without changing the stored map or guessing by room labels. */
export function mapForRoute(graph: ParsedGraph, path: string[]): ParsedGraph {
  const ids = new Set(path);
  const id = (value: string) => ids.has(value) ? value : ids.has(`${graph.floor}-${value}`) ? `${graph.floor}-${value}` : value;
  return {
    ...graph,
    nodes: graph.nodes.map((n) => ({ ...n, id: id(n.id) })),
    edges: graph.edges.map((e) => ({ ...e, a: id(e.a), b: id(e.b) })),
    current_node_id: graph.current_node_id ? id(graph.current_node_id) : null,
  };
}

/** Resolve the chosen start on this map, never through the demo's fixed node IDs. */
export function mapDeparture(graph: ParsedGraph, explicitId: string | null, choice: string | null) {
  if (explicitId) return graph.nodes.find((n) => n.id === explicitId || `${graph.floor}-${n.id}` === explicitId);
  if (choice === "here") return graph.nodes.find((n) => n.id === graph.current_node_id);
  const type = { hall: "elevator_hall", stair: "stairs", main: "entrance" }[choice ?? ""];
  return type ? graph.nodes.find((n) => n.type === type) : undefined;
}

/** A demo selection hides the previous upload, so that upload cannot determine the current floor. */
export function currentMapFloor(state: { mapDemo: boolean; startAt: { floor: string } | null; parsed: { floor: string } | null }) {
  return state.startAt?.floor ?? (state.mapDemo ? "1F" : state.parsed?.floor ?? "1F");
}


export type MapSelection = {
  place: Place;
  mapDemo: boolean;
  parsed: ParsedGraph | null;
  parsedPhoto: ConfirmedMap["photo"];
  start: StartNodeId | null;
  startAt: { id: string; label: string; floor: string; via: "scan" | "list" | "pin" } | null;
  photoMap: ApiGraph | null;
};

/** Keep the entire selection together so Back restores its graph, photo, floor and start as one unit. */
export function mapSelection(state: MapSelection): MapSelection {
  const { place, mapDemo, parsed, parsedPhoto, start, startAt, photoMap } = state;
  return { place, mapDemo, parsed, parsedPhoto, start, startAt, photoMap };
}
