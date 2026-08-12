import React from "react";

export default function LoadingScreen({ label = "로딩 중…" }) {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <p className="loading-label">{label}</p>
    </div>
  );
}
