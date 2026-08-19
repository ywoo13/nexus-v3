const TOKEN_KEY = "nexus_auth_token";

// 클라이언트가 이미 알고 있는 WebSocket 주소(ws://...)에서 REST API 베이스(http://...)를 유도합니다.
// 별도 env 변수를 추가하지 않아도 되도록 하기 위함입니다.
const WS_URL = import.meta.env.VITE_SERVER_URL || "ws://localhost:2567";
// network/room.js와 roomsApi.js에서도 같은 REST API 베이스가 필요해서 내보냅니다.
export const API_BASE = WS_URL.replace(/^ws/, "http");

export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function loginWithGoogle(credential) {
  const res = await fetch(`${API_BASE}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "구글 로그인에 실패했습니다.");
  }
  const data = await res.json();
  saveToken(data.token);
  return data.user;
}

// 네이버 로그인은 팝업(naverAuth.js)이 이미 서버와의 OAuth 흐름을 전부 마치고 token/user를
// 들고 온 상태이므로, 여기서는 그 토큰을 저장하기만 하면 됩니다 (구글의 loginWithGoogle과
// 대응되는 자리).
export function completeNaverLogin({ token, user }) {
  saveToken(token);
  return user;
}

// 저장된 토큰으로 세션을 복원합니다. 토큰이 없거나 만료됐으면 null을 반환합니다.
export async function restoreSession() {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      clearToken();
      return null;
    }
    const data = await res.json();
    return data.user;
  } catch (err) {
    console.warn("세션 복원 실패:", err);
    return null;
  }
}

// 입장 시점의 아바타/닉네임을 계정에 저장 (실패해도 게임 진행에는 지장 없게 조용히 처리)
export async function saveProfile({ name, avatarPreset }) {
  const token = getToken();
  if (!token) return;

  try {
    await fetch(`${API_BASE}/api/auth/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, avatarPreset }),
    });
  } catch (err) {
    console.warn("프로필 저장 실패:", err);
  }
}
