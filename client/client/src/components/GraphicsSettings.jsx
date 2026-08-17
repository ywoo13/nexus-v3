import React, { useState } from "react";
import { useGraphicsSettings } from "../state/graphicsSettings.js";

// 게임 중에 떠 있는 "⚙️ 그래픽 설정" 버튼 + 켜고 끌 수 있는 패널.
// 저사양 기기에서 렉이 있을 때 무거운 효과를 바로 끌 수 있게 해줍니다. 선택값은 localStorage에
// 저장되어(graphicsSettings.js) 다음 접속 때도 그대로 유지됩니다.
function ToggleRow({ label, description, checked, onChange }) {
  return (
    <label className="graphics-toggle-row">
      <div className="graphics-toggle-text">
        <span className="graphics-toggle-label">{label}</span>
        <span className="graphics-toggle-desc">{description}</span>
      </div>
      <span className={`graphics-switch ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}>
        <span className="graphics-switch-knob" />
      </span>
    </label>
  );
}

export default function GraphicsSettings() {
  const [open, setOpen] = useState(false);
  const highQuality = useGraphicsSettings((s) => s.highQuality);
  const filmGrain = useGraphicsSettings((s) => s.filmGrain);
  const setHighQuality = useGraphicsSettings((s) => s.setHighQuality);
  const setFilmGrain = useGraphicsSettings((s) => s.setFilmGrain);

  return (
    <>
      <button
        type="button"
        className="graphics-settings-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="그래픽 설정"
      >
        ⚙️
      </button>

      {open && (
        <div className="graphics-settings-panel">
          <div className="room-switcher-header">
            <span>그래픽 설정</span>
            <button type="button" className="chat-close-btn" onClick={() => setOpen(false)} aria-label="닫기">
              ✕
            </button>
          </div>

          <ToggleRow
            label="고품질 그래픽"
            description="부드러운 그림자 · 은은한 발광(Bloom) · 화면 비네트"
            checked={highQuality}
            onChange={setHighQuality}
          />
          <ToggleRow
            label="필름 그레인"
            description="살짝의 노이즈 질감 + 색수차 효과"
            checked={filmGrain}
            onChange={setFilmGrain}
          />

          <p className="graphics-settings-hint">렉이 있다면 먼저 "고품질 그래픽"을 꺼보세요. 설정은 자동 저장됩니다.</p>
        </div>
      )}
    </>
  );
}
