import type { ApiRoute } from "@/types/api";

/** Empty routes still have an authoritative destination and a single-node path. */
export function routeSummary(route: ApiRoute) {
  const startFloor = /^((?:\d+F)|(?:B\d+))-/.exec(route.path[0] ?? "")?.[1];
  return {
    departureFloor: startFloor ?? route.steps[0]?.floor ?? route.arrived.floor,
    arrivalFloor: route.arrived.floor,
    alreadyThere: route.steps.length === 0 && route.path.length === 1 && route.path[0] === route.arrived.node,
  };
}
