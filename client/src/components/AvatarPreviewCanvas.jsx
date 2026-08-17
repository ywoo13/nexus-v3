import React, { useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, ContactShadows } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import PresetAvatarModel from "./PresetAvatarModel.jsx";
import FilmGrain from "./FilmGrain.jsx";
import { useGraphicsSettings } from "../state/graphicsSettings.js";

// 게임 화면에서 쓰는 것과 동일한 PresetAvatarModel을 그대로 돌려서 보여줍니다.
// (미리보기용 다른 모델을 따로 만들지 않으므로 실제 인게임 모습과 100% 일치합니다)
function Turntable({ presetId }) {
  const group = useRef();
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.6;
  });
  // PresetAvatarModel은 엉덩이(hip)가 로컬 y=0.9에 오도록 만들어져 있어서,
  // 그룹을 -0.95만큼 내려 인게임 화면과 무관하게 미리보기 안에서 캐릭터가
  // 세로 중앙 근처(원점 = 기본 카메라가 바라보는 지점)에 오도록 맞춥니다.
  return (
    <group ref={group} position={[0, -0.95, 0]}>
      <PresetAvatarModel presetId={presetId} offsetY={0} />
    </group>
  );
}

export default function AvatarPreviewCanvas({ presetId }) {
  // ⚙️ 그래픽 설정(월드 화면과 동일한 스토어)을 그대로 따라가서, 캐릭터 만들기 화면에서
  // 보던 느낌이 실제 게임 화면과 어긋나지 않게 합니다.
  const highQuality = useGraphicsSettings((s) => s.highQuality);
  const filmGrain = useGraphicsSettings((s) => s.filmGrain);
  const anyPostEffect = highQuality || filmGrain;

  return (
    <Canvas
      shadows
      dpr={highQuality ? [1, 1.5] : [1, 1]}
      camera={{ position: [0, 0.05, 2.5], fov: 30 }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping, // World.jsx와 같은 톤 매핑 — 인게임과 미리보기 색감이 어긋나지 않도록
        toneMappingExposure: 1.05,
      }}
    >
      <color attach="background" args={["#1b1730"]} />
      <ambientLight intensity={0.5} color="#fff3ea" />
      <directionalLight position={[3, 4, 3]} intensity={1.3} color="#ffe8d6" castShadow />
      {/* 캐릭터가 배경(짙은 보라)에 묻히지 않도록 반대편에서 은은한 림 라이트 */}
      <directionalLight position={[-2, 1.5, -2]} intensity={0.4} color="#9fc4ff" />
      <Environment preset="sunset" />
      <Turntable presetId={presetId} />
      <ContactShadows position={[0, -0.95, 0]} opacity={0.45} scale={3.2} blur={2.2} />
      {anyPostEffect && (
        <EffectComposer disableNormalPass multisampling={0}>
          {highQuality && <Bloom mipmapBlur luminanceThreshold={0.7} luminanceSmoothing={0.2} intensity={0.3} />}
          {highQuality && <Vignette eskil={false} offset={0.2} darkness={0.6} />}
          {filmGrain && <FilmGrain />}
        </EffectComposer>
      )}
    </Canvas>
  );
}
