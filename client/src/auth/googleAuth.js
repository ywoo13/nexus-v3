const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

let scriptLoadPromise = null;

function loadGoogleScript() {
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  }).catch((err) => {
    // ⚠️ 실패한 Promise를 그대로 캐싱해두면, 첫 시도가 일시적인 네트워크 문제로
    // 실패했을 때 이후 renderGoogleButton 호출(예: 로그아웃 후 다시 로그인 화면 진입)이
    // 네트워크가 복구됐어도 영원히 같은 실패를 재사용하게 됩니다. 실패 시 캐시를
    // 비워서 다음 호출이 스크립트 로드를 처음부터 다시 시도하게 합니다.
    scriptLoadPromise = null;
    throw err;
  });
  return scriptLoadPromise;
}

/**
 * 구글 로그인 버튼을 지정한 DOM 엘리먼트 안에 렌더링합니다.
 * 로그인에 성공하면 onCredential(idTokenString)이 호출됩니다.
 */
export async function renderGoogleButton(containerEl, onCredential) {
  if (!GOOGLE_CLIENT_ID) {
    console.warn("VITE_GOOGLE_CLIENT_ID가 설정되어 있지 않습니다. client/.env를 확인하세요.");
    return;
  }
  if (!containerEl) return;

  await loadGoogleScript();

  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (response) => onCredential(response.credential),
  });

  window.google.accounts.id.renderButton(containerEl, {
    type: "standard",
    theme: "filled_black",
    size: "large",
    shape: "pill",
    text: "signin_with",
    width: 260,
  });
}
