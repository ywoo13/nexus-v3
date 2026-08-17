import React, { forwardRef, useMemo } from "react";
import { FilmGrainEffect } from "../effects/filmGrainEffect.js";

// @react-three/postprocessing에서 직접 만든 Effect를 쓰는 표준 패턴:
// useMemo로 인스턴스를 한 번만 만들고 <primitive>로 EffectComposer 안에 꽂아줍니다.
const FilmGrain = forwardRef(function FilmGrain({ grainIntensity, aberrationStrength }, ref) {
  const effect = useMemo(
    () => new FilmGrainEffect({ grainIntensity, aberrationStrength }),
    [grainIntensity, aberrationStrength]
  );
  return <primitive ref={ref} object={effect} dispose={null} />;
});

export default FilmGrain;
