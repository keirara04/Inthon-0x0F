"use client";

import { useGilgyeol } from "@/lib/gilgyeol/store";
import { Mascot } from "./Mascot";
import { PrimaryButton } from "./ui";

/** Demo login: the name comes prefilled, so one tap on 시작하기 goes on. No account, nothing sent to the server. */
export function LoginScreen() {
  const { state: s, actions } = useGilgyeol();
  const name = s.nickname.trim();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name) actions.enterTrial();
      }}
      className="flex min-h-full flex-col gap-4 px-5 pt-2 pb-5"
    >
      {/* Same header as the welcome screen: logo = home. */}
      <header className="flex items-center">
        <button
          type="button"
          onClick={() => actions.go("landing")}
          aria-label="어디路 홈"
          className="flex min-h-11 items-center gap-1.5 border-none bg-transparent p-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 96px mascot head mark */}
          <img src="/mascot/head.png" alt="" aria-hidden="true" width={30} height={30} />
          <span className="text-[22px] font-extrabold tracking-[-0.04em] text-brand">어디路</span>
        </button>
      </header>

      <div aria-hidden="true" className="flex min-h-[180px] flex-1 items-center justify-center rounded-[26px] bg-haptic-tint">
        <Mascot pose="main" height={130} motion="bob" />
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[28px] leading-[1.28] font-extrabold tracking-[-0.03em] text-pretty">반가워요! 이름을 알려주세요</h1>
        <p className="m-0 text-[16px] leading-[1.55] text-pretty text-muted">가입 없이 바로 체험해요. 안내할 때 이 이름으로 불러드려요.</p>
      </div>

      <div className="mt-auto flex flex-col gap-2.5">
        <label htmlFor="gg-nickname" className="text-[14px] font-semibold text-ink">
          이름
        </label>
        <input
          id="gg-nickname"
          type="text"
          autoComplete="nickname"
          maxLength={20}
          value={s.nickname}
          onChange={(e) => actions.update({ nickname: e.target.value })}
          className="h-[52px] rounded-2xl border-[1.5px] border-ink bg-surface px-4 text-[17px] text-ink outline-none"
        />
        <PrimaryButton tall type="submit" disabled={!name}>
          {name ? `${name}님으로 시작하기` : "시작하기"}
        </PrimaryButton>
      </div>
    </form>
  );
}
