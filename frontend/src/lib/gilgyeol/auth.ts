// Real nickname accounts, issued as Sanctum tokens by the Laravel API.
// The 3-minute trial stays login-free; signing in creates an account and keeps its token on this device only.
import { ApiError, apiRequest } from "./api";

export interface AuthUser {
  id: number;
  nickname: string;
  name: string;
  created_at?: string | null;
}

interface AuthSession {
  token: string;
  user: AuthUser;
}

const TOKEN_KEY = "gilgyeol-auth-token";

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Creates an account and signs it in. Throws ApiError with a field message from the API. */
export async function registerAccount(nickname: string, password: string, passwordConfirmation: string): Promise<AuthUser> {
  const session = await apiRequest<AuthSession>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ nickname, password, password_confirmation: passwordConfirmation }),
  });
  writeToken(session.token);
  return session.user;
}

/** Signs in with an existing nickname. */
export async function loginAccount(nickname: string, password: string): Promise<AuthUser> {
  const session = await apiRequest<AuthSession>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ nickname, password }),
  });
  writeToken(session.token);
  return session.user;
}

/**
 * Revokes this device's token and forgets it locally. The local token is cleared even when the
 * request fails, so an offline user can still sign out.
 */
export async function logoutAccount(): Promise<void> {
  const token = readToken();
  writeToken(null);
  if (!token) return;
  try {
    await apiRequest<void>("/api/auth/logout", { method: "POST", headers: bearer(token) });
  } catch {}
}

/** The account behind this device's stored token, if it is still valid. Never throws. */
export async function restoreSession(): Promise<AuthUser | null> {
  const token = readToken();
  if (!token) return null;
  try {
    return await apiRequest<AuthUser>("/api/auth/me", { headers: bearer(token) });
  } catch (err) {
    // A revoked or expired token should not be retried on every launch.
    if (err instanceof ApiError && err.status === 401) writeToken(null);
    return null;
  }
}
