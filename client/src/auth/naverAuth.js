import { API_BASE } from "./session.js";

const POPUP_FEATURES = "width=460,height=620,menubar=no,toolbar=no,location=no,status=no";

// 네이버는 구글처럼 클라이언트 JS만으로 끝나는 로그인 방식을 지원하지 않고, 서버가
// CLIENT_SECRET을 들고 전체 OAuth2 인가 코드 흐름을 처리해야 합니다 (server/src/auth.js의
// /api/auth/naver/start, /api/auth/naver/callback 참고). 그래서 클라이언트는:
//   1. 팝업 창을 서버의 /naver/start로 띄우고
//   2. 서버가 네이버와의 인증을 전부 마친 뒤 팝업이 postMessage로 결과(token/user)를 보내주면
//      그걸 받아서 Promise를 resolve합니다.
export function loginWithNaverPopup() {
  return new Promise((resolve, reject) => {
    let settled = false;
    const origin = window.location.origin;
    const popup = window.open(
      `${API_BASE}/api/auth/naver/start?origin=${encodeURIComponent(origin)}`,
      "nexus-naver-login",
      POPUP_FEATURES
    );

    if (!popup) {
      reject(new Error("팝업이 차단되었습니다. 브라우저의 팝업 차단을 해제한 뒤 다시 시도해주세요."));
      return;
    }

    let serverOrigin;
    try {
      serverOrigin = new URL(API_BASE).origin;
    } catch {
      reject(new Error("서버 주소(VITE_SERVER_URL)가 올바르지 않습니다."));
      popup.close();
      return;
    }

    function cleanup() {
      window.removeEventListener("message", handleMessage);
      clearInterval(popupCheckInterval);
    }

    function handleMessage(event) {
      // 팝업(서버 도메인)에서 온 메시지만 신뢰합니다 — 다른 탭이나 페이지에 있는
      // 광고 iframe 등이 우연히 보낸 postMessage를 로그인 응답으로 착각하면 안 되므로
      // origin을 꼭 확인합니다.
      if (event.origin !== serverOrigin) return;
      const data = event.data;
      if (!data || (data.type !== "nexus-naver-auth" && data.type !== "nexus-naver-auth-error")) {
        return;
      }

      settled = true;
      cleanup();

      if (data.type === "nexus-naver-auth-error") {
        reject(new Error(data.error || "네이버 로그인에 실패했습니다."));
        return;
      }
      resolve({ token: data.token, user: data.user });
    }

    window.addEventListener("message", handleMessage);

    // 사용자가 로그인을 마치지 않고 팝업을 그냥 닫아버릴 수도 있는데, 그 경우도 처리해야
    // Promise가 영원히 pending 상태로 남지 않습니다.
    const popupCheckInterval = setInterval(() => {
      if (popup.closed) {
        cleanup();
        if (!settled) reject(new Error("로그인 창이 닫혔습니다."));
      }
    }, 500);
  });
}
