import React from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Environment, ContactShadows, SoftShadows } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, HueSaturation } from "@react-three/postprocessing";
import { Physics, RigidBody, CuboidCollider } from "@react-three/rapier";
import Player from "../components/Player.jsx";
import LocalPlayerController from "../components/LocalPlayerController.jsx";
import PlazaMap from "../components/PlazaMap.jsx";
import CustomRoomMap from "../components/CustomRoomMap.jsx";
import CameraRig from "../components/CameraRig.jsx";
import FilmGrain from "../components/FilmGrain.jsx";
import { usePlayersStore } from "../state/store.js";
import { useGraphicsSettings } from "../state/graphicsSettings.js";
import { API_BASE } from "../auth/session.js";

export default function World() {
  const players = usePlayersStore((s) => s.players);
  const sessionId = usePlayersStore((s) => s.sessionId);
  const mapId = usePlayersStore((s) => s.mapId);
  const modelUrl = usePlayersStore((s) => s.modelUrl);
  const highQuality = useGraphicsSettings((s) => s.highQuality);
  const filmGrain = useGraphicsSettings((s) => s.filmGrain);
  // EffectComposer 자체도 렌더 패스를 하나 더 만드는 비용이 있어서, 켤 효과가 하나도
  // 없으면(둘 다 꺼져 있으면) 아예 마운트하지 않습니다 — "최대 절전" 옵션인 셈.
  const anyPostEffect = highQuality || filmGrain;

  const others = Object.entries(players).filter(([id]) => id !== sessionId);
  // modelUrl은 방마다 다른 형태일 수 있습니다:
  // - Supabase Storage 모드: 서버가 이미 완전한 절대 URL(https://...supabase.co/...)을 내려줌 → 그대로 사용
  // - 로컬 디스크 모드: 서버 상대 경로("/uploads/models/xxx.glb")를 내려줌 → API_BASE(REST 서버 주소)를 앞에 붙여야 함
  const absoluteModelUrl = !modelUrl ? null : /^https?:\/\//.test(modelUrl) ? modelUrl : `${API_BASE}${modelUrl}`;

  return (
    <Canvas
      shadows
      dpr={highQuality ? [1, 1.5] : [1, 1]} // 저품질 모드에서는 레티나 배율도 아예 안 씀 (해상도 자체를 낮춤)
      gl={{
        antialias: true,
        // ACES 필름톤 매핑 — 밝은 부분이 그냥 하얗게 날아가지 않고 부드럽게 롤오프되어
        // 사진/영화에 가까운 톤이 됩니다. Bloom과 궁합이 특히 좋습니다.
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
    >
      <color attach="background" args={["#dfe9f0"]} />
      <fog attach="fog" args={["#dfe9f0", 22, 55]} />

      {/* ── 조명 리그: 태양(key) + 하늘/땅 반사광(fill) + 반대편 림 라이트, 3점 조명 구도 ── */}
      <ambientLight intensity={0.32} color="#fff3ea" />
      <hemisphereLight args={["#aecdff", "#6b4b3a", 0.5]} />
      <directionalLight
        position={[6, 9, 4]}
        intensity={1.4}
        color="#ffe8d6"
        castShadow
        shadow-mapSize={highQuality ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      {/* 태양 반대편에서 은은하게 채워주는 차가운 림 라이트 — 캐릭터 실루엣이 배경에 묻히지 않게 함.
          그림자는 안 만듦(캐스트 안 켬) — 성능상 그림자맵 2장을 계산할 필요는 없어서 */}
      <directionalLight position={[-7, 5, -6]} intensity={0.45} color="#9fc4ff" />
      {/* 그림자 가장자리를 부드럽게(PCSS 근사) — highQuality가 꺼져 있으면 아예 렌더링 안 해서
          비용을 완전히 없앱니다 (기본 PCF 그림자로 자동 대체됨) */}
      {highQuality && <SoftShadows size={14} samples={10} focus={0.7} />}
      <Environment preset="sunset" background blur={0.7} />

      <Physics gravity={[0, -9.81, 0]}>
        {/* 낙사 방지용 안전망 — 실제 맵/임시 배경의 정상 바닥(y≈0)과 겹치지 않도록 훨씬 아래에
            보이지 않는 충돌체만 둡니다. 맵에 구멍이 있거나 아직 바닥이 없어도 무한히 떨어지지 않게 함 */}
        <RigidBody type="fixed">
          <CuboidCollider args={[60, 0.5, 60]} position={[0, -8, 0]} />
        </RigidBody>

        {/* mapId가 "main"이면 client/public/models/plaza.glb (없으면 임시 배경), 그 외엔 관리자가
            /manager 에서 업로드한 커스텀 방의 .glb를 불러옵니다. key={mapId}로 방을 옮길 때마다
            이전 방의 geometry/충돌체가 깨끗하게 정리되고 새 방으로 완전히 다시 마운트됩니다. */}
        {mapId === "main" ? (
          <PlazaMap key="main" />
        ) : (
          <CustomRoomMap key={mapId} url={absoluteModelUrl} />
        )}

        {others.map(([id, p]) => (
          <Player key={id} data={p} />
        ))}

        <LocalPlayerController />
      </Physics>

      <ContactShadows position={[0, 0.01, 0]} opacity={0.45} scale={40} blur={2.2} />

      {/* ── 후처리: ⚙️ 그래픽 설정(GraphicsSettings.jsx)에서 개별적으로 켜고 끌 수 있음 ──
          - highQuality: 밝은 부분 은은한 발광(Bloom) + 화면 가장자리 비네트 + 채도 부스트
          - filmGrain: 직접 만든 커스텀 셰이더(FilmGrain.jsx/effects/filmGrainEffect.js) —
            필름 그레인 노이즈 + 아주 살짝의 색수차. highQuality와 별개로 독립적으로 켤 수 있음 */}
      {anyPostEffect && (
        <EffectComposer disableNormalPass multisampling={0}>
          {highQuality && <Bloom mipmapBlur luminanceThreshold={0.7} luminanceSmoothing={0.2} intensity={0.35} />}
          {highQuality && <Vignette eskil={false} offset={0.15} darkness={0.55} />}
          {highQuality && <HueSaturation saturation={0.06} />}
          {filmGrain && <FilmGrain />}
        </EffectComposer>
      )}

      <CameraRig /> {/* 기본 카메라(PerspectiveCamera)도 이 안에서 만듭니다 — 위 Canvas의 camera prop 대신 */}
    </Canvas>
  );
}
