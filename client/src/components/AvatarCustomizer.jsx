import React, { useState } from "react";
import { AVATAR_PRESETS } from "./PresetAvatarModel.jsx";
import AvatarPreviewCanvas from "./AvatarPreviewCanvas.jsx";

export default function AvatarCustomizer({ onJoin, errorMessage, loading, initialData, googleUser, onLogout }) {
  const [step, setStep] = useState(initialData?.avatarPreset ? "name" : "avatar");
  const [avatarPreset, setAvatarPreset] = useState(initialData?.avatarPreset || AVATAR_PRESETS[0].id);
  const [name, setName] = useState(initialData?.name || "");

  function pickPreset(id) {
    setAvatarPreset(id);
    setStep("name");
  }

  function handleSubmit(e) {
    e.preventDefault();
    // 접속 시도 중(loading)에는 무시합니다. 제출 버튼은 disabled 처리되어 있지만,
    // 텍스트 입력창에 포커스가 있는 상태에서 Enter 키를 누르면 브라우저에 따라
    // disabled된 제출 버튼과 무관하게 폼 submit이 다시 발생할 수 있어, 접속 요청이
    // 중복으로 나가는 것을 여기서도 한 번 더 막습니다.
    if (loading) return;
    onJoin({ name: name.trim() || "Guest", avatarPreset });
  }

  const selected = AVATAR_PRESETS.find((p) => p.id === avatarPreset) || AVATAR_PRESETS[0];

  if (step === "avatar") {
    return (
      <div className="customizer-screen">
        <div className="avatar-creator-card">
          <h1>Nexus</h1>
          <p className="subtitle">아바타를 골라보세요</p>
          <div className="preset-grid">
            {AVATAR_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`preset-card ${p.id === avatarPreset ? "selected" : ""}`}
                style={{ "--preset-color": p.body }}
                onClick={() => pickPreset(p.id)}
              >
                <span className="preset-emoji">{p.emoji}</span>
                <span className="preset-label">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="customizer-screen">
      <div className="customizer-card">
        <h1>Nexus</h1>
        <p className="subtitle">닉네임을 정하고 광장에 입장하세요</p>

        {googleUser && (
          <div className="account-badge">
            <span>🔓 {googleUser.name || googleUser.email}님으로 로그인됨</span>
            <button type="button" onClick={onLogout}>
              로그아웃
            </button>
          </div>
        )}

        <div className="avatar-preview-3d">
          <AvatarPreviewCanvas presetId={avatarPreset} />
        </div>

        <form onSubmit={handleSubmit}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="닉네임"
            maxLength={16}
            autoFocus
          />
          <button type="submit" disabled={loading}>
            {loading ? "입장 중…" : "입장하기"}
          </button>
        </form>

        <button type="button" className="text-link" onClick={() => setStep("avatar")}>
          아바타 다시 고르기
        </button>

        {errorMessage && <p className="connect-error">{errorMessage}</p>}
      </div>
    </div>
  );
}
