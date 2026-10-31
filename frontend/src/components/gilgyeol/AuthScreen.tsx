"use client";

import { useState, type FormEvent } from "react";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { Mascot } from "./Mascot";
import { BackHeader, Notice, PrimaryButton, SecondaryButton, Title } from "./ui";

type Mode = "login" | "signup";

const field =
  "h-[52px] w-full rounded-[14px] border-[1.5px] border-edge bg-surface px-4 text-[16px] font-normal text-ink placeholder:text-muted focus:border-ink focus:outline-none";
const fieldLabel = "flex flex-col gap-1.5 text-[13px] font-bold text-muted";

/** Nickname + password accounts against the real API. The 3-minute trial stays available without signing in. */
export function AuthScreen() {
  const { state: s, actions } = useGilgyeol();
  const [mode, setMode] = useState<Mode>("login");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);

    // Check the same rules locally first, so the form answers without a round trip.
    const id = nickname.trim();
    if (id.length < 3) return setError("닉네임은 3자 이상 입력해 주세요");
    if (password.length < 6) return setError("비밀번호는 6자 이상 입력해 주세요");
    if (mode === "signup" && password !== confirm) return setError("비밀번호가 서로 달라요");

    setPending(true);
    try {
      if (mode === "login") await actions.login(id, password);
      else await actions.register(id, password, confirm);
      // On success the store moves to the welcome screen, so this form unmounts.
    } catch (err) {
      setError(err instanceof Error ? err.message : "잠시 후 다시 시도해 주세요");
      setPending(false);
    }
  };

  if (s.user) {
    return (
      <div className="flex min-h-full flex-col gap-4 px-5 pt-1 pb-7">
        <BackHeader label="계정" onBack={actions.back} />
        <div className="flex flex-col items-center gap-3 rounded-[24px] bg-haptic-tint px-5 py-7 text-center">
          <Mascot pose="main" height={120} motion="bob" />
          <div className="text-[14px] font-bold text-haptic-ink">로그인됨</div>
          <div className="text-[26px] font-extrabold tracking-[-0.02em]">{s.user.nickname}</div>
          <p className="m-0 max-w-[260px] text-[14px] leading-[1.5] text-muted">
            이 기기에 로그인되어 있어요. 앱을 다시 열어도 이 계정으로 이어집니다.
          </p>
        </div>
        <div className="mt-auto flex flex-col gap-2.5">
          <PrimaryButton tall onClick={() => actions.go("welcome")}>
            길찾기 시작하기
          </PrimaryButton>
          <SecondaryButton onClick={() => void actions.logout()}>로그아웃</SecondaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-4 px-5 pt-1 pb-7">
      <BackHeader label="계정" onBack={actions.back} />
      <div className="flex flex-col gap-1.5">
        <Title className="leading-[1.25]">{mode === "login" ? "다시 만나서 반가워요" : "처음 오셨나요?"}</Title>
        <p className="m-0 text-[15px] leading-normal text-muted">
          {mode === "login" ? "닉네임으로 로그인하고 길찾기를 이어가세요." : "닉네임과 비밀번호만 있으면 바로 시작할 수 있어요."}
        </p>
      </div>

      <div role="tablist" aria-label="로그인 또는 회원가입" className="flex gap-0.5 rounded-[10px] bg-[#ECEAE3] p-[3px]">
        {(["login", "signup"] as const).map((m) => (
          <button
            type="button"
            role="tab"
            key={m}
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={`h-11 flex-1 rounded-lg border-none text-[14px] font-bold text-ink ${mode === m ? "bg-surface" : "bg-transparent"}`}
          >
            {m === "login" ? "로그인" : "회원가입"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <label className={fieldLabel}>
          닉네임
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="3~20자, 한글·영문·숫자"
            aria-label="닉네임"
            autoComplete="username"
            autoCapitalize="none"
            maxLength={20}
            className={field}
          />
        </label>
        <label className={fieldLabel}>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6자 이상"
            aria-label="비밀번호"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            maxLength={72}
            className={field}
          />
        </label>
        {mode === "signup" && (
          <label className={fieldLabel}>
            비밀번호 확인
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="한 번 더 입력해 주세요"
              aria-label="비밀번호 확인"
              autoComplete="new-password"
              maxLength={72}
              className={field}
            />
          </label>
        )}
        {error && <Notice tone="err">{error}</Notice>}
        <PrimaryButton type="submit" tall disabled={pending} className="mt-1">
          {pending ? (mode === "login" ? "로그인 중…" : "가입 중…") : mode === "login" ? "로그인" : "회원가입"}
        </PrimaryButton>
      </form>

      <p className="m-0 text-center text-[12px] leading-[1.6] text-muted">
        로그인 없이도 3분 체험을 할 수 있어요.
        <br />
        계정 정보는 서비스 제공을 위해서만 사용합니다.
      </p>
    </div>
  );
}
