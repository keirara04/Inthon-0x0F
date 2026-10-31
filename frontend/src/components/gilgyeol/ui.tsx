"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useDemoTools } from "@/lib/gilgyeol/demo";

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export { cx };

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement>;

/** Burgundy primary CTA (58px; `tall` = 60px). */
export function PrimaryButton({ className, tall, dark, ...p }: BtnProps & { tall?: boolean; dark?: boolean }) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        "rounded-[18px] border-none font-bold text-white disabled:bg-edge disabled:text-[#6B6E68]",
        tall ? "h-[60px] text-[18px]" : "h-[58px] text-[17px]",
        dark ? "bg-ink" : "bg-brand",
        className,
      )}
    />
  );
}

export function SecondaryButton({ className, dashed, ...p }: BtnProps & { dashed?: boolean }) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        "h-[52px] rounded-2xl border-[1.5px] bg-surface text-[16px] font-semibold text-ink",
        dashed ? "border-dashed border-[#BDB8AC]" : "border-edge",
        className,
      )}
    />
  );
}

/** Smaller outline button (50px) used in pairs at the bottom of guidance screens. */
export function GhostButton({ className, ...p }: BtnProps) {
  return <button type="button" {...p} className={cx("h-[50px] rounded-[14px] border-[1.5px] border-edge bg-surface text-[15px] font-semibold text-ink", className)} />;
}

export function BackHeader({ label, onBack, closeLabel }: { label: ReactNode; onBack: () => void; closeLabel?: string }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={onBack} aria-label={closeLabel ?? "뒤로"} className="-ml-3 flex h-12 w-11 flex-none items-center justify-center border-none bg-transparent">
        <svg width="12" height="20" viewBox="0 0 12 20" aria-hidden="true">
          <polyline points="10,2 2,10 10,18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="text-[15px] font-semibold text-muted">{label}</div>
    </div>
  );
}

export function Title({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cx("m-0 text-[26px] leading-[1.3] font-extrabold tracking-[-0.02em]", className)}>{children}</h1>;
}

type Tone = "warn" | "ok" | "haptic" | "neutral" | "err" | "white";
const TONES: Record<Tone, string> = {
  warn: "bg-warn-tint text-warn-ink",
  ok: "bg-ok-tint text-ok-ink",
  haptic: "bg-haptic-tint text-haptic-ink",
  neutral: "bg-warm-panel text-ink",
  err: "bg-err-tint text-err-ink",
  white: "bg-surface text-ink",
};

export function Badge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1.5 self-start rounded-lg px-2.5 py-[5px] text-[13px] font-bold", TONES[tone], className)}>{children}</span>;
}

export function Notice({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div role="status" className={cx("rounded-[14px] px-3.5 py-3 text-[14px] leading-[1.45] font-semibold", TONES[tone])}>
      {children}
    </div>
  );
}

/** Dashed panel that marks controls as simulated demo input, not real sensors. */
export function DemoBox({ label, children }: { label: string; children: ReactNode }) {
  const demo = useDemoTools();
  if (!demo) return null;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-dashed border-[#BDB8AC] p-3">
      <div className="font-mono text-[11px] font-semibold text-muted">{label}</div>
      {children}
    </div>
  );
}

export function SegButton({ on, className, ...p }: BtnProps & { on: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      {...p}
      className={cx("h-11 rounded-xl border-[1.5px] px-1 text-[13px] font-bold", on ? "border-ink bg-ink text-white" : "border-edge bg-surface text-ink", className)}
    />
  );
}

export function Placeholder({ label, dark }: { label: string; dark?: boolean }) {
  return (
    <div className={cx("absolute top-2.5 left-2.5 rounded px-1.5 py-[3px] font-mono text-[10px] font-semibold", dark ? "text-[#A8ABA5]" : "bg-white/85 text-muted")}>
      {label}
    </div>
  );
}

export function Check({ size = 14, color = "#fff", width = 2.2 }: { size?: number; color?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <polyline points="2,7 6,11 12,3" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StatusDot({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2 flex-none rounded-full"
      style={dashed ? { border: `2px dashed ${color}` } : { background: color }}
    />
  );
}
