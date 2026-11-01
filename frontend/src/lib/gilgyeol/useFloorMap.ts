"use client";

import { useEffect, useState } from "react";
import { DEMO_1F_GRAPH, fetchFloorGraph, type ParsedGraph } from "./api";
import { mapKey } from "./confirmedMaps";
import { EXAMPLE_4F_GRAPH } from "./data";
import { useGilgyeol } from "./store";

/** Confirmed uploads and saved maps take priority over the verified floor endpoint. */
export function useFloorMap(floor: string) {
  const { state } = useGilgyeol();
  const confirmed = state.confirmedMaps[mapKey(state.place, floor)];
  const demo = state.mapDemo ? (floor === "1F" ? DEMO_1F_GRAPH : floor === "4F" ? EXAMPLE_4F_GRAPH : undefined) : undefined;
  const [loaded, setLoaded] = useState<{ key: string; graph: ParsedGraph | null } | null>(null);
  const key = mapKey(state.place, floor);
  useEffect(() => {
    if (confirmed || demo || !floor) return;
    let alive = true;
    void fetchFloorGraph(floor, state.place.name).then((graph) => { if (alive) setLoaded({ key, graph }); });
    return () => { alive = false; };
  }, [floor, key, confirmed, demo, state.place.name]);
  return demo ?? confirmed?.graph ?? (loaded?.key === key ? loaded.graph : undefined);
}
