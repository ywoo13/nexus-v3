import React, { useEffect, useRef, useState } from "react";
import { renderGoogleButton } from "../auth/googleAuth.js";

export default function AuthScreen({ onLogin, onGuest }) {
  const buttonRef = useRef(null);
  const [error, setError] = useState(null);
  const [scriptFailed, setScriptFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    renderGoogleButton(buttonRef.current, async (credential) => {
      setError(null);
      try {
        await onLogin(credential);
      } catch (err) {
        console.error(err);
        setError("구글 로그인에 실패했어요. 다시 시도해주세요.");
      }
    }).catch((err) => {
      // 네트워크 문제, 광고/트래커 차단 확장 프로그램 등으로 구글 스크립트 자체를
      // 못 불러오는 경우 — 예전엔 콘솔에만 조용히 에러가 남고 버튼 자리만 비어있었습니다.
      if (cancelled) return;
      console.warn("구글 로그인 스크립트를 불러오지 못했습니다:", err?.message);
      setScriptFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [onLogin]);

  return (
    <div className="customizer-screen">
      <div className="customizer-card">
        <h1>Nexus</h1>
        <p className="subtitle">로그인하면 아바타와 닉네임이 저장돼요</p>

        <div className="google-btn-slot" ref={buttonRef} />
        {scriptFailed && (
          <p className="connect-error">
            구글 로그인을 불러오지 못했어요 (광고 차단 확장 프로그램이나 네트워크 문제일 수 있어요).
            게스트로 계속 이용할 수 있어요.
          </p>
        )}

        <button type="button" className="skip-link" onClick={onGuest}>
          게스트로 계속하기 →
        </button>

        {error && <p className="connect-error">{error}</p>}
      </div>
    </div>
  );
}
