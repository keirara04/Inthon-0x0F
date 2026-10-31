// Alienie, the 어디路 mascot: a first-time visitor to campus, like our users.
// Poses are transparent WebP crops in public/mascot/ (cut from the character sheet, ~10–20 KB each).
// Decorative only: always aria-hidden, and kept off the guidance screens ("보지 않고").
import { cx } from "./ui";

const POSES = {
  main: [360, 304], // telescope, looking around: landing hero, welcome
  front: [175, 211],
  sit: [267, 268],
  happy: [259, 249], // arrival
  lying: [304, 179], // waiting "...": loading
  peek: [332, 206], // "?!": off route, nothing found
  back: [220, 270],
  walk: [288, 267],
} as const;

export type MascotPose = keyof typeof POSES;

/** bob = gentle idle float, pop = bounce in once (then float), peek = rise in from below. */
export function Mascot({
  pose,
  height,
  motion,
  className,
}: {
  pose: MascotPose;
  height: number;
  motion?: "bob" | "pop" | "peek";
  className?: string;
}) {
  const [w, h] = POSES[pose];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny pre-optimised WebP, no resizing needed
    <img
      src={`/mascot/${pose}.webp`}
      alt=""
      aria-hidden="true"
      width={Math.round((w * height) / h)}
      height={height}
      draggable={false}
      decoding="async"
      className={cx("pointer-events-none flex-none select-none", motion && `gl-m-${motion}`, className)}
    />
  );
}
