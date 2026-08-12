import React from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, ContactShadows } from "@react-three/drei";
import { Physics, RigidBody, CuboidCollider } from "@react-three/rapier";
import Player from "../components/Player.jsx";
import LocalPlayerController from "../components/LocalPlayerController.jsx";
import PlazaMap from "../components/PlazaMap.jsx";
import CameraRig from "../components/CameraRig.jsx";
import { usePlayersStore } from "../state/store.js";

export default function World() {
  const players = usePlayersStore((s) => s.players);
  const sessionId = usePlayersStore((s) => s.sessionId);

  const others = Object.entries(players).filter(([id]) => id !== sessionId);

  return (
    <Canvas shadows camera={{ position: [0, 4, 8], fov: 50 }}>
      <color attach="background" args={["#dfe9f0"]} />
      <fog attach="fog" args={["#dfe9f0", 22, 55]} />

      <ambientLight intensity={0.7} color="#fff3ea" />
      <directionalLight
        position={[6, 9, 4]}
        intensity={1.4}
        color="#ffe8d6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <Environment preset="sunset" background blur={0.7} />

      <Physics gravity={[0, -9.81, 0]}>
        {/* 낙사 방지용 안전망 — 실제 맵/임시 배경의 정상 바닥(y≈0)과 겹치지 않도록 훨씬 아래에
            보이지 않는 충돌체만 둡니다. 맵에 구멍이 있거나 아직 바닥이 없어도 무한히 떨어지지 않게 함 */}
        <RigidBody type="fixed">
          <CuboidCollider args={[60, 0.5, 60]} position={[0, -8, 0]} />
        </RigidBody>

        {/* client/public/models/plaza.glb 있으면 실제 맵, 없으면 임시 배경(바닥 포함) — PlazaMap.jsx가 자동 판단 */}
        <PlazaMap />

        {others.map(([id, p]) => (
          <Player key={id} data={p} />
        ))}

        <LocalPlayerController />
      </Physics>

      <ContactShadows position={[0, 0.01, 0]} opacity={0.45} scale={40} blur={2.2} />

      <CameraRig />
    </Canvas>
  );
}
