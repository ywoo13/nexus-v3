import React, { useEffect } from "react";

const SPLASH_DURATION_MS = 2200;
const LOGO_TEXT = "Nexus";

export default function SplashScreen({ onFinish }) {
  useEffect(() => {
    const timer = setTimeout(onFinish, SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div className="splash-screen" onClick={onFinish}>
      <div className="splash-ring" />
      <h1 className="splash-logo" aria-label={LOGO_TEXT}>
        {LOGO_TEXT.split("").map((char, i) => (
          <span
            key={i}
            className="splash-letter"
            style={{ animationDelay: `${i * 0.08}s` }}
          >
            {char}
          </span>
        ))}
      </h1>
      <p className="splash-tagline">소셜 3D 월드</p>
      <p className="splash-skip">탭하여 건너뛰기</p>
    </div>
  );
}
