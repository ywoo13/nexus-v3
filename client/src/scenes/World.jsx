import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, Canvas } from "@react-three/fiber";
import { Environment, ContactShadows } from "@react-three/drei";
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
import { localPlayerPosition } from "../state/localPlayerPosition.js";
import { API_BASE } from "../auth/session.js";

const SUN_OFFSET = new THREE.Vector3(6, 9, 4); // 태양 위치 = 플레이어 기준 이 방향/거리만큼 항상 떨어져서 따라감

/**
 * 태양 역할의 directionalLight + 그 그림자 카메라(target)가 플레이어를 따라다니게 합니다.
 * (직전 버전은 그림자 카메라 범위(-20~20, 40x40 유닛짜리 정사각형)가 월드 원점에 고정돼 있었는데,
 *  그 넓은 범위를 1024~2048 해상도 그림자맵 하나로 커버하다 보니 텍셀 밀도가 낮아서 그림자 가장자리가
 *  들쭉날쭉/뭉개진 이상한 모양으로 보였습니다. 플레이어를 따라다니게 하면 훨씬 좁은 범위(-10~10)만
 *  커버하면 되니 같은 해상도로도 훨씬 또렷한 그림자가 나옵니다.)
 */
function FollowSun({ castShadow, mapSize }) {
  const lightRef = useRef();
  const targetRef = useRef();

  useEffect(() => {
    // JSX의 target={targetRef.current} 방식은 첫 렌더 시점엔 targetRef.current가 아직 null이라
    // (ref는 마운트 이후에 채워짐) 기본 타겟(항상 원점 고정)이 붙어버리고, 이후엔 리렌더가 없어
    // (여기 애니메이션은 전부 useFrame으로 ref만 직접 조작하므로) 영영 안 바뀝니다.
    // 마운트 후 한 번, 두 ref가 모두 준비된 시점에 직접 연결해줘야 확실합니다.
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current;
    }
  }, []);

  useFrame((_, delta) => {
    const light = lightRef.current;
    const target = targetRef.current;
    if (!light || !target) return;
    const lambda = 6;
    target.position.x = THREE.MathUtils.damp(target.position.x, localPlayerPosition.x, lambda, delta);
    target.position.z = THREE.MathUtils.damp(target.position.z, localPlayerPosition.z, lambda, delta);
    light.position.x = target.position.x + SUN_OFFSET.x;
    light.position.y = SUN_OFFSET.y;
    light.position.z = target.position.z + SUN_OFFSET.z;
  });

  return (
    <>
      <object3D ref={targetRef} position={[0, 0, 0]} />
      <directionalLight
        ref={lightRef}
        position={[SUN_OFFSET.x, SUN_OFFSET.y, SUN_OFFSET.z]}
        intensity={1.4}
        color="#ffe8d6"
        castShadow={castShadow}
        shadow-mapSize={mapSize}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
    </>
  );
}

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
      shadows="soft" // three.js 표준 PCFSoftShadowMap — 예전에 쓰던 drei의 SoftShadows(전역 셰이더 패치)는
      // 켰다 끄면 이미 컴파일된 셰이더 프로그램에 패치가 눌러붙어서 그림자가 안 지워지거나 이상한
      // 모양으로 굳어버리는 문제가 있어 제거했습니다. 이 표준 방식은 그런 부작용이 없습니다.
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

      {/* ── 조명 리그: 태양(key, 플레이어를 따라다님) + 하늘/땅 반사광(fill) + 반대편 림 라이트 ── */}
      <ambientLight intensity={0.32} color="#fff3ea" />
      <hemisphereLight args={["#aecdff", "#6b4b3a", 0.5]} />
      <FollowSun castShadow={highQuality} mapSize={highQuality ? [2048, 2048] : [1024, 1024]} />
      {/* 태양 반대편에서 은은하게 채워주는 차가운 림 라이트 — 캐릭터 실루엣이 배경에 묻히지 않게 함.
          그림자는 안 만듦(캐스트 안 켬) — 성능상 그림자맵 2장을 계산할 필요는 없어서 */}
      <directionalLight position={[-7, 5, -6]} intensity={0.45} color="#9fc4ff" />
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

      {/* highQuality가 꺼지면 이 블롭 그림자도 같이 꺼져서, "버튼 꺼도 그림자가 안 없어진다"는
          문제가 재발하지 않게 했습니다 (예전엔 highQuality와 무관하게 항상 켜져 있었음) */}
      {highQuality && <ContactShadows position={[0, 0.01, 0]} opacity={0.45} scale={40} blur={2.2} />}

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
