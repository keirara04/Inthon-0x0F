"use client";

import { useEffect, useRef, useState } from "react";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { PrimaryButton } from "./ui";

/** Demo account, prefilled so a judge logs in with one tap. */
const DEMO = { email: "haeun.kim@korea.ac.kr", password: "gilgyeol2026", name: "김하은" };
const INPUT = "h-[52px] rounded-2xl border-[1.5px] border-ink bg-surface px-4 text-[17px] text-ink outline-none";

/** 로그인 sheet from the landing. No account or server: logging in only personalizes the landing. */
export function LoginSheet() {
  const { actions } = useGilgyeol();
  const close = () => actions.update({ loginSheet: false });
  const dialogRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState(DEMO.email);
  const [password, setPassword] = useState(DEMO.password);

  useEffect(() => {
    // preventScroll: the sheet starts off-screen (slide-up animation); a plain focus() would scroll the device screen.
    dialogRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && actions.update({ loginSheet: false });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions]);

  return (
    <div className="gl-backdrop absolute inset-0 z-[7] flex flex-col justify-end bg-[rgba(20,22,20,.45)]" onClick={close}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gg-login-title"
        onClick={(e) => e.stopPropagation()}
        className="gl-sheet flex max-h-[88%] flex-col gap-4 overflow-auto rounded-t-[26px] bg-app-bg px-5 pt-5 pb-[calc(30px+env(safe-area-inset-bottom))] outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 id="gg-login-title" className="m-0 text-[20px] font-extrabold">
            로그인
          </h2>
          <button type="button" onClick={close} className="h-11 border-none bg-transparent px-3 text-[15px] font-semibold text-ink">
            닫기
          </button>
        </div>
        <p className="m-0 -mt-2 text-[15px] text-muted">어디路 계정으로 로그인하세요</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const name = email.trim().toLowerCase() === DEMO.email ? DEMO.name : email.split("@")[0];
            actions.update({ user: { name, email: email.trim() }, loginSheet: false });
            actions.toast(`${name}님, 환영해요`);
          }}
          className="flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1.5 text-[14px] font-semibold text-ink">
            이메일
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1.5 text-[14px] font-semibold text-ink">
            비밀번호
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
          </label>
          <PrimaryButton type="submit" className="mt-1">
            로그인
          </PrimaryButton>
        </form>
        <p className="m-0 text-center text-[13px] text-muted">데모 계정이 입력되어 있어요 · 실제 인증은 하지 않아요</p>
      </div>
    </div>
  );
}
