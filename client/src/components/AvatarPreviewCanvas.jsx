import React, { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, ContactShadows } from "@react-three/drei";
import PresetAvatarModel from "./PresetAvatarModel.jsx";

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
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.05, 2.5], fov: 30 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#1b1730"]} />
      <ambientLight intensity={0.85} color="#fff3ea" />
      <directionalLight position={[3, 4, 3]} intensity={1.3} color="#ffe8d6" castShadow />
      <Environment preset="sunset" />
      <Turntable presetId={presetId} />
      <ContactShadows position={[0, -0.95, 0]} opacity={0.45} scale={3.2} blur={2.2} />
    </Canvas>
  );
}
