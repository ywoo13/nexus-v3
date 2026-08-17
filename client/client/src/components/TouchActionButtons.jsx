import React, { useState } from "react";
import { setTouchRun, requestJump } from "../input/movementInput.js";

export default function TouchActionButtons() {
  const [isRunning, setIsRunning] = useState(false);

  function runStart(e) {
    e.preventDefault();
    setIsRunning(true);
    setTouchRun(true);
  }
  function runEnd(e) {
    e.preventDefault();
    setIsRunning(false);
    setTouchRun(false);
  }
  function jump(e) {
    e.preventDefault();
    requestJump();
  }

  return (
    <div className="action-buttons">
      <button
        type="button"
        className={`action-btn ${isRunning ? "active" : ""}`}
        onPointerDown={runStart}
        onPointerUp={runEnd}
        onPointerLeave={runEnd}
        onPointerCancel={runEnd}
        aria-label="달리기"
      >
        🏃
      </button>
      <button type="button" className="action-btn" onPointerDown={jump} aria-label="점프">
        ⤴
      </button>
    </div>
  );
}
