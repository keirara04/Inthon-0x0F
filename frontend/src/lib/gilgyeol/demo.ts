"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** Presenter tools (demo panel, simulated inputs) are hidden from end users; open the app with `?demo` to show them. */
export function useDemoTools() {
  return useSyncExternalStore(
    noop,
    () => new URLSearchParams(window.location.search).has("demo"),
    () => false,
  );
}
