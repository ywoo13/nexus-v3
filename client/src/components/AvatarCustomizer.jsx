import React, { useState } from "react";
import { AVATAR_PRESETS } from "./PresetAvatarModel.jsx";
import AvatarPreviewCanvas from "./AvatarPreviewCanvas.jsx";

export default function AvatarCustomizer({ onNext, initialData, accountUser, onLogout }) {
  const [step, setStep] = useState(initialData?.avatarPreset ? "name" : "avatar");
  const [avatarPreset, setAvatarPreset] = useState(initialData?.avatarPreset || AVATAR_PRESETS[0].id);
  const [name, setName] = useState(initialData?.name || "");

  function pickPreset(id) {
    setAvatarPreset(id);
    setStep("name");
  }

  function handleSubmit(e) {
    e.preventDefault();
    onNext({ name: name.trim() || "Guest", avatarPreset });
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
        <p className="subtitle">닉네임을 정하고 다음 단계로 넘어가세요</p>

        {accountUser && (
          <div className="account-badge">
            <span>🔓 {accountUser.name || accountUser.email || "계정"}님으로 로그인됨</span>
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
          <button type="submit">다음: 방 고르기 →</button>
        </form>

        <button type="button" className="text-link" onClick={() => setStep("avatar")}>
          아바타 다시 고르기
        </button>
      </div>
    </div>
  );
}
