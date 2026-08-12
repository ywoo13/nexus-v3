import React, { useEffect } from "react";
import { setTouchDirection, bindTouchSafety } from "../input/movementInput.js";

const BUTTONS = [
  { key: "up", label: "▲", area: "up" },
  { key: "left", label: "◀", area: "left" },
  { key: "right", label: "▶", area: "right" },
  { key: "down", label: "▼", area: "down" },
];

function DPadButton({ direction, label, area }) {
  function press(e) {
    e.preventDefault();
    setTouchDirection(direction, true);
  }
  function release(e) {
    e.preventDefault();
    setTouchDirection(direction, false);
  }

  return (
    <button
      type="button"
      className="dpad-btn"
      style={{ gridArea: area }}
      onPointerDown={press}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
    >
      {label}
    </button>
  );
}

// 마우스가 있는 데스크톱에서는 CSS로 숨기고, 터치 기기(pointer: coarse)에서만 보여줍니다.
export default function TouchDPad() {
  useEffect(() => bindTouchSafety(), []);

  return (
    <div className="dpad">
      {BUTTONS.map((b) => (
        <DPadButton key={b.key} direction={b.key} label={b.label} area={b.area} />
      ))}
    </div>
  );
}
