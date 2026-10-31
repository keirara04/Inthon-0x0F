/** A vertical step ends with a new-floor map check before any more directions. */
export function stepCompletion(kind: "walk" | "elevator" | "stairs", last: boolean, mapConfirmed = false) {
  if (kind !== "walk" && !mapConfirmed) return "floorMap";
  return last ? "arrive" : "next";
}

/** Reject an explicitly different floor. An unreadable number can be confirmed by the user. */
export function canUseFloorMap(target: string, map: { floor: string; floorSource?: "map" | "hint" } | null) {
  return map !== null && (map.floorSource !== "map" || map.floor === target);
}

export function floorName(floor: string) {
  return floor.replace(/^B(\d+)$/, "지하 $1층").replace(/F$/, "층");
}
