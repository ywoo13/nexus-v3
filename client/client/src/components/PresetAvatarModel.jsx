import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";

// ── 프리셋 아바타 ──────────────────────────────────────────────────────────
// Ready Player Me(서비스 종료) → MetaPerson(embed에 유료 플랜 필요 + iframe 3rd-party
// 쿠키 문제)까지 외부 아바타 생성 API를 두 번 연속 잃고 나서, 아예 외부 의존성이
// 없는 방식으로 바꿨습니다: 코드로 직접 만든 캐릭터 몇 종류 중 하나를 고르는 방식.
// 장점: 회원가입/결제/네트워크 요청이 전혀 없고, 서비스가 없어질 일도 없습니다.
// 단점: RPM/MetaPerson처럼 셀피 기반 커스텀 아바타는 못 만듭니다 (트레이드오프는
// README의 마이그레이션 노트에 정리해뒀습니다).
//
// v2: 이전 버전은 상자/구를 그냥 이어붙인 수준이라 "허접해 보인다"는 피드백이 있었습니다.
// 실사 GLB 아바타(Zepeto/RPM류)를 코드만으로 재현할 수는 없지만, 아래 기법들로
// 같은 예산(외부 에셋 0개) 안에서 훨씬 더 "제대로 만든 캐릭터"처럼 보이게 다듬었습니다:
//  - 관절마다 구형 조인트를 넣어 팔다리 이음매가 뚝뚝 끊겨 보이지 않게 함
//  - 몸통은 각진 박스 대신 모서리가 둥근 RoundedBox로 교체
//  - 눈/눈썹/입/하이라이트로 얼굴에 표정을 추가
//  - 프리셋마다 헤어/귀/꼬리/수염/백팩 등 실루엣이 다른 디테일을 추가
//  - 손/발을 별도 메쉬로 마감해 팔다리가 잘린 것처럼 보이지 않게 함
//  - 씬에 이미 있는 <Environment>가 자동으로 반사/하이라이트를 얹어주므로
//    meshStandardMaterial의 roughness/metalness만 프리셋별로 신경 씀
//
// v3: 애니메이션을 한 단계 더 다듬었습니다 — 팔에 팔꿈치 관절을 추가하고, 착지 스쿼시(눌림)와
// 점프의 상승/하강 포즈를 구분했으며, 이모트(👋😂❤️🎉😢)를 눈 위 이모지 표시에서 그치지 않고
// 실제 몸 동작으로 재생하도록 했습니다. 상세 내용은 아래 useFrame과 playEmote()의 주석 참고.
export const AVATAR_PRESETS = [
  { id: "classic", label: "클래식", emoji: "🙂", body: "#4f9dff", accent: "#274a78", skin: "#ffd9b3", head: "round", hair: "cap" },
  { id: "coral", label: "폭시", emoji: "🦊", body: "#ff6b6b", accent: "#8a2e2e", skin: "#ff6b6b", head: "round", ears: true, snout: true },
  { id: "sunshine", label: "로봇", emoji: "🤖", body: "#ffd93d", accent: "#8a7420", skin: "#ffd93d", head: "square", antenna: true, glowEyes: true, metal: true },
  { id: "mint", label: "고스트", emoji: "👻", body: "#6bcfa6", accent: "#2f6b52", skin: "#6bcfa6", head: "cone", robe: true, translucent: true, glowEyes: true },
  { id: "violet", label: "우주인", emoji: "🚀", body: "#c084fc", accent: "#5c3487", skin: "#ffd9b3", head: "round", visor: true, pack: true, hair: "cap" },
  { id: "peach", label: "냥이", emoji: "🐱", body: "#ff9f45", accent: "#8a4f1a", skin: "#ff9f45", head: "round", ears: true, snout: true, tail: true, whiskers: true },
];

export function getAvatarPreset(id) {
  return AVATAR_PRESETS.find((p) => p.id === id) || AVATAR_PRESETS[0];
}

const WALK_SPEED = 8;

// 공통 머티리얼 프리셋 — 매번 roughness/metalness를 반복해서 적지 않도록.
function Mat({ color, glow, translucent, metal, ...rest }) {
  return (
    <meshStandardMaterial
      color={color}
      roughness={metal ? 0.3 : 0.55}
      metalness={metal ? 0.75 : 0.06}
      transparent={!!translucent}
      opacity={translucent ? 0.82 : 1}
      emissive={glow ? color : "#000000"}
      emissiveIntensity={glow ? 0.9 : 0}
      {...rest}
    />
  );
}

function Face({ preset }) {
  const { accent, glowEyes, snout } = preset;
  if (preset.visor) return null; // 바이저가 얼굴을 덮는 프리셋(우주인)은 이목구비 생략
  if (preset.head === "square") {
    // 로봇: 눈은 발광하는 LED 사각형, 입은 얇은 스캔라인
    return (
      <group position={[0, 0.01, 0.171]}>
        <mesh position={[-0.08, 0.02, 0]}><boxGeometry args={[0.05, 0.035, 0.01]} /><Mat color={accent} glow /></mesh>
        <mesh position={[0.08, 0.02, 0]}><boxGeometry args={[0.05, 0.035, 0.01]} /><Mat color={accent} glow /></mesh>
        <mesh position={[0, -0.07, 0]}><boxGeometry args={[0.14, 0.012, 0.01]} /><Mat color={accent} glow /></mesh>
      </group>
    );
  }
  const eyeColor = glowEyes ? accent : "#1c2431";
  return (
    <group position={[0, 0.01, 0]}>
      {/* 눈: 검은자 + 작은 하이라이트로 생기 부여 */}
      <mesh position={[-0.075, 0, 0.185]}><sphereGeometry args={[0.026, 10, 10]} /><Mat color={eyeColor} glow={glowEyes} /></mesh>
      <mesh position={[0.075, 0, 0.185]}><sphereGeometry args={[0.026, 10, 10]} /><Mat color={eyeColor} glow={glowEyes} /></mesh>
      {!glowEyes && (
        <>
          <mesh position={[-0.067, 0.009, 0.205]}><sphereGeometry args={[0.008, 6, 6]} /><meshBasicMaterial color="#ffffff" /></mesh>
          <mesh position={[0.083, 0.009, 0.205]}><sphereGeometry args={[0.008, 6, 6]} /><meshBasicMaterial color="#ffffff" /></mesh>
          {/* 눈썹 */}
          <mesh position={[-0.075, 0.05, 0.19]} rotation={[0, 0, 0.12]}><boxGeometry args={[0.05, 0.012, 0.012]} /><Mat color={accent} /></mesh>
          <mesh position={[0.075, 0.05, 0.19]} rotation={[0, 0, -0.12]}><boxGeometry args={[0.05, 0.012, 0.012]} /><Mat color={accent} /></mesh>
        </>
      )}
      {/* 입: 살짝 웃는 곡선 */}
      <mesh position={[0, -0.075, 0.185]} rotation={[Math.PI / 2, 0, Math.PI]}>
        <torusGeometry args={[0.032, 0.007, 6, 10, Math.PI * 0.85]} />
        <Mat color="#8a4a4a" />
      </mesh>
      {snout && (
        <mesh position={[0, -0.03, 0.205]}><sphereGeometry args={[0.022, 8, 8]} /><Mat color="#2a2a2a" /></mesh>
      )}
    </group>
  );
}

function Hair({ preset }) {
  if (preset.hair !== "cap" || preset.visor) return null;
  return (
    <mesh castShadow position={[0, 0.045, -0.01]}>
      <sphereGeometry args={[0.208, 24, 16, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
      <Mat color={preset.accent} />
    </mesh>
  );
}

function Head({ preset }) {
  const { accent, head, ears, antenna, visor, metal, translucent } = preset;
  return (
    <group position={[0, 0.65, 0]}>
      {/* 목: 머리와 몸통 사이 이음매를 메워서 머리가 떠 보이지 않게 함 */}
      <mesh castShadow position={[0, -0.19, 0]}>
        <cylinderGeometry args={[0.07, 0.08, 0.08, 12]} />
        <Mat color={preset.skin} metal={metal} translucent={translucent} />
      </mesh>

      {head === "square" && (
        <RoundedBox castShadow args={[0.32, 0.32, 0.32]} radius={0.05} smoothness={4}>
          <Mat color={preset.skin} metal={metal} />
        </RoundedBox>
      )}
      {head === "cone" && (
        <mesh castShadow rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.21, 0.42, 24]} />
          <Mat color={preset.skin} translucent={translucent} />
        </mesh>
      )}
      {head === "round" && (
        <mesh castShadow scale={[1, 1.04, 1]}>
          <sphereGeometry args={[0.2, 28, 24]} />
          <Mat color={preset.skin} metal={metal} translucent={translucent} />
        </mesh>
      )}

      <Hair preset={preset} />
      <Face preset={preset} />

      {ears && (
        <>
          <mesh castShadow position={[-0.13, 0.17, 0]} rotation={[0, 0, 0.45]}>
            <coneGeometry args={[0.075, 0.17, 10]} />
            <Mat color={accent} />
          </mesh>
          <mesh castShadow position={[0.13, 0.17, 0]} rotation={[0, 0, -0.45]}>
            <coneGeometry args={[0.075, 0.17, 10]} />
            <Mat color={accent} />
          </mesh>
          {/* 귀 안쪽 디테일 */}
          <mesh position={[-0.13, 0.15, 0.025]} rotation={[0, 0, 0.45]}>
            <coneGeometry args={[0.04, 0.09, 10]} />
            <Mat color="#ffffff" />
          </mesh>
          <mesh position={[0.13, 0.15, 0.025]} rotation={[0, 0, -0.45]}>
            <coneGeometry args={[0.04, 0.09, 10]} />
            <Mat color="#ffffff" />
          </mesh>
        </>
      )}
      {antenna && (
        <group position={[0, 0.22, 0]}>
          <mesh castShadow><cylinderGeometry args={[0.015, 0.015, 0.16, 8]} /><Mat color={accent} metal /></mesh>
          <mesh castShadow position={[0, 0.1, 0]}><sphereGeometry args={[0.035, 10, 10]} /><Mat color={accent} glow /></mesh>
        </group>
      )}
      {whiskersFor(preset)}
      {visor ? (
        <group position={[0, -0.01, 0.16]}>
          <mesh>
            <sphereGeometry args={[0.165, 20, 20, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
            <meshPhysicalMaterial color="#1c2431" transparent opacity={0.7} roughness={0.08} metalness={0.2} clearcoat={1} envMapIntensity={1.4} />
          </mesh>
          {/* 헬멧 테두리 링 */}
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.02, -0.02]}>
            <torusGeometry args={[0.165, 0.018, 8, 20, Math.PI]} />
            <Mat color={accent} metal />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}

function whiskersFor(preset) {
  if (!preset.whiskers) return null;
  const rows = [0.01, -0.015];
  return (
    <group>
      {[-1, 1].map((side) =>
        rows.map((y, i) => (
          <mesh
            key={`${side}-${i}`}
            position={[side * 0.19, y, 0.13]}
            rotation={[0, side * -0.35, 0]}
          >
            <cylinderGeometry args={[0.003, 0.003, 0.14, 4]} />
            <meshStandardMaterial color="#ffffff" roughness={0.4} />
          </mesh>
        ))
      )}
    </group>
  );
}

// 팔/다리: 관절 위치(jointRef)에 작은 구를 두어 몸통-팔다리 이음매가
// 뚝 끊긴 것처럼 보이지 않게 하고, 그 아래로 둥근 캡슐 세그먼트를 붙입니다.
function Limb({ jointRef, length, radius, color, translucent, children }) {
  return (
    <group ref={jointRef}>
      <mesh castShadow>
        <sphereGeometry args={[radius * 1.08, 12, 12]} />
        <Mat color={color} translucent={translucent} />
      </mesh>
      <mesh castShadow position={[0, -length / 2, 0]}>
        <capsuleGeometry args={[radius, length - radius * 1.6, 6, 12]} />
        <Mat color={color} translucent={translucent} />
      </mesh>
      {children}
    </group>
  );
}

/**
 * 이모트(👋😂❤️🎉😢) 재생 중일 때의 몸 포즈를 계산해서 적용합니다. 걷기 애니메이션과 마찬가지로
 * "지금 몇 초째 재생 중인지"(phase)를 받아 사인파 기반으로 자연스럽게 반복/변화하는 동작을 만들고,
 * refs.lerpX/Y/Z(damp 기반 보간)로 적용하기 때문에 이모트가 시작되거나 끝나는 순간에도 관절이
 * 툭 튀지 않고 부드럽게 이어집니다. 목록에 없는 이모지가 들어와도(향후 이모트 추가 등) 기본 포즈로
 * 대응하도록 default 케이스를 둡니다.
 */
function playEmote(emote, phase, refs) {
  const { spine, headRef, leftArm, rightArm, leftForearm, rightForearm, leftUpLeg, rightUpLeg, leftLeg, rightLeg, tailRef, group, lerpX, lerpY, lerpZ } = refs;

  // 대부분의 이모트는 서 있는 자세가 기본이라, 다리는 공통으로 rest pose로 되돌려둡니다.
  lerpX(leftUpLeg, 0, 10);
  lerpX(rightUpLeg, 0, 10);
  lerpX(leftLeg, 0, 10);
  lerpX(rightLeg, 0, 10);

  switch (emote) {
    case "👋": {
      // 오른팔을 옆으로 들어 올리고, 팔꿈치 아래(손)를 좌우로 흔들어 손 인사를 표현
      lerpZ(rightArm, -2.3, 12);
      lerpX(rightArm, -0.2, 12);
      lerpX(rightForearm, Math.sin(phase * 9) * 0.5 - 0.2, 20);
      lerpX(leftArm, 0, 10);
      lerpX(leftForearm, 0.12, 10);
      lerpZ(headRef, Math.sin(phase * 9) * 0.05, 10);
      lerpY(spine, Math.sin(phase * 9) * 0.04, 10);
      break;
    }
    case "😂": {
      // 배꼽 잡고 웃는 느낌: 상체를 앞뒤로 크게 들썩이고, 양팔은 살짝 벌려 배 쪽으로
      const shake = Math.sin(phase * 7);
      lerpX(spine, 0.18 + shake * 0.16, 16);
      lerpZ(leftArm, 0.9, 12);
      lerpZ(rightArm, -0.9, 12);
      lerpX(leftArm, -0.3, 12);
      lerpX(rightArm, -0.3, 12);
      lerpX(leftForearm, 1.3, 14);
      lerpX(rightForearm, 1.3, 14);
      lerpZ(headRef, shake * 0.1, 12);
      break;
    }
    case "❤️": {
      // 양손을 가슴 앞으로 모아 하트를 표현, 살짝 두근거리는 펄스
      const pulse = 1 + Math.sin(phase * 3) * 0.04;
      lerpZ(leftArm, 1.2, 10);
      lerpZ(rightArm, -1.2, 10);
      lerpX(leftArm, -1.0, 10);
      lerpX(rightArm, -1.0, 10);
      lerpX(leftForearm, 0.9, 12);
      lerpX(rightForearm, 0.9, 12);
      if (group.current) group.current.scale.set(pulse, pulse, pulse);
      lerpX(headRef, -0.08, 8);
      break;
    }
    case "🎉": {
      // 만세 하듯 양팔을 번쩍 들고, 통통 튀는 점프를 반복
      const hop = Math.max(0, Math.sin(phase * 6));
      lerpX(leftArm, -2.5, 14);
      lerpX(rightArm, -2.5, 14);
      lerpZ(leftArm, 0.3 + Math.sin(phase * 6) * 0.15, 14);
      lerpZ(rightArm, -0.3 - Math.sin(phase * 6 + Math.PI) * 0.15, 14);
      lerpX(leftForearm, -0.2, 12);
      lerpX(rightForearm, -0.2, 12);
      if (group.current) group.current.position.y += hop * 0.14;
      lerpX(leftUpLeg, -hop * 0.2, 14);
      lerpX(rightUpLeg, -hop * 0.2, 14);
      break;
    }
    case "😢": {
      // 고개를 떨구고 팔을 들어 눈가를 닦는 느낌, 어깨가 들썩이는 흐느낌
      const sob = Math.sin(phase * 4) * 0.06;
      lerpX(spine, 0.14 + sob, 10);
      lerpX(headRef, 0.32, 10);
      lerpX(leftArm, -1.3, 10);
      lerpX(rightArm, -1.3, 10);
      lerpZ(leftArm, 0.5, 10);
      lerpZ(rightArm, -0.5, 10);
      lerpX(leftForearm, 1.5, 12);
      lerpX(rightForearm, 1.5, 12);
      lerpZ(tailRef, sob, 8);
      break;
    }
    default: {
      // 알 수 없는 이모트: 가볍게 한 번 통통 뛰는 정도의 무난한 기본 리액션
      const hop = Math.max(0, Math.sin(phase * 5));
      lerpX(leftArm, -1.2 * hop, 14);
      lerpX(rightArm, -1.2 * hop, 14);
      if (group.current) group.current.position.y += hop * 0.05;
    }
  }
}

/**
 * 외부 GLB/API 없이 코드로 직접 만든 캐릭터를 렌더링하고, AvatarModel.jsx(예전 GLB 아바타용)와
 * 동일한 걷기/정지 애니메이션 수식을 그대로 재사용합니다 — 다만 GLTF 본(bone) 대신
 * 코드로 만든 관절 그룹(useRef)을 직접 회전시킵니다. 로딩이 필요 없어 Suspense도 필요 없습니다.
 */
export default function PresetAvatarModel({
  presetId,
  movingRef,
  runningRef,
  groundedRef,
  verticalVelocityRef, // optional: ref holding signed vertical velocity, lets us tell "rising" from "falling" in mid-air
  emote, // optional: current emote string (e.g. "👋"), or "" / undefined when none is playing
  offsetY = 0,
}) {
  const preset = useMemo(() => getAvatarPreset(presetId), [presetId]);
  const group = useRef();
  const walkPhase = useRef(0);
  const emotePhase = useRef(0);
  const prevEmote = useRef("");
  const prevGrounded = useRef(true);
  const landSquash = useRef(0); // 0 = 평상시, 1 = 착지 직후(가장 눌린 상태) → 시간이 지나며 0으로 감쇠

  const spine = useRef();
  const headRef = useRef();
  const leftUpLeg = useRef();
  const leftLeg = useRef();
  const rightUpLeg = useRef();
  const rightLeg = useRef();
  const leftArm = useRef();
  const rightArm = useRef();
  const leftForearm = useRef();
  const rightForearm = useRef();
  const tailRef = useRef();

  useFrame((state, delta) => {
    if (!group.current) return;
    const isMoving = !!movingRef?.current;
    const isRunning = !!runningRef?.current;
    const isGrounded = groundedRef ? groundedRef.current !== false : true;
    const isEmoting = typeof emote === "string" && emote.length > 0;
    const t = state.clock.elapsedTime;

    // ── 착지 스쿼시: 방금 막 착지한 순간을 감지해서 살짝 눌렸다가 튕겨 돌아오는 느낌을 줌 ──
    if (isGrounded && !prevGrounded.current) landSquash.current = 1;
    prevGrounded.current = isGrounded;
    landSquash.current = THREE.MathUtils.damp(landSquash.current, 0, 6, delta);
    const squash = landSquash.current;

    // 항상 적용되는 가벼운 숨쉬기(idle) 상하 움직임 + 착지 스쿼시(눌림)를 얹음
    group.current.position.y = offsetY + Math.sin(t * 1.5) * 0.01 - squash * 0.06;
    group.current.scale.set(1 + squash * 0.09, 1 - squash * 0.14, 1 + squash * 0.09);

    const setX = (ref, v) => ref.current && (ref.current.rotation.x = v);
    const setZ = (ref, v) => ref.current && (ref.current.rotation.z = v);
    const lerpAxis = (ref, axis, target, lambda) =>
      ref.current && (ref.current.rotation[axis] = THREE.MathUtils.damp(ref.current.rotation[axis], target, lambda, delta));
    const lerpX = (ref, target, lambda = 10) => lerpAxis(ref, "x", target, lambda);
    const lerpY = (ref, target, lambda = 10) => lerpAxis(ref, "y", target, lambda);
    const lerpZ = (ref, target, lambda = 10) => lerpAxis(ref, "z", target, lambda);

    if (isEmoting) {
      // 새로 시작된(또는 다른 종류로 바뀐) 이모트면 위상을 0부터 다시 시작 — 매번 자연스럽게 처음부터 재생
      if (emote !== prevEmote.current) emotePhase.current = 0;
      prevEmote.current = emote;
      emotePhase.current += delta;
      playEmote(emote, emotePhase.current, {
        spine, headRef, leftArm, rightArm, leftForearm, rightForearm,
        leftUpLeg, rightUpLeg, leftLeg, rightLeg, tailRef, group,
        lerpX, lerpY, lerpZ, setX, setZ,
      });
      walkPhase.current = 0;
      return;
    }
    prevEmote.current = "";

    if (!isGrounded) {
      // verticalVelocityRef가 있으면 상승/하강을 구분한 포즈를(더 자연스러움), 없으면 예전처럼 단일 점프 포즈를 사용
      const vy = verticalVelocityRef?.current;
      const rising = typeof vy === "number" ? vy > 0.4 : true;
      if (rising) {
        // 뛰어오르는 중: 다리를 뒤로 살짝 접고 팔은 뒤로 흔들며 위로 추진하는 느낌
        lerpX(leftUpLeg, -0.15, 10);
        lerpX(rightUpLeg, -0.15, 10);
        lerpX(leftLeg, 0.9, 10);
        lerpX(rightLeg, 0.9, 10);
        lerpX(leftArm, -1.6, 10);
        lerpX(rightArm, -1.6, 10);
        lerpX(leftForearm, -0.3, 10);
        lerpX(rightForearm, -0.3, 10);
      } else {
        // 떨어지는 중: 착지에 대비해 다리를 앞으로 살짝 뻗고 팔을 벌려 균형을 잡는 포즈
        lerpX(leftUpLeg, 0.4, 10);
        lerpX(rightUpLeg, 0.4, 10);
        lerpX(leftLeg, 0.35, 10);
        lerpX(rightLeg, 0.35, 10);
        lerpX(leftArm, -0.5, 10);
        lerpX(rightArm, -0.5, 10);
        lerpZ(leftArm, 0.35, 10);
        lerpZ(rightArm, -0.35, 10);
      }
      lerpX(spine, rising ? -0.1 : 0.08, 8);
      walkPhase.current = 0;
    } else if (isMoving) {
      const speedMultiplier = isRunning ? 1.7 : 1;
      const swingAmount = isRunning ? 0.85 : 0.5;
      const armAmount = isRunning ? 1.0 : 0.6;

      walkPhase.current += delta * WALK_SPEED * speedMultiplier;
      const swing = Math.sin(walkPhase.current) * swingAmount;
      const swingOpp = -swing;
      const kneeBend = (phase) => Math.max(0, Math.sin(phase)) * (isRunning ? 0.95 : 0.6);
      const elbowBend = (phase) => 0.35 + Math.max(0, Math.sin(phase)) * (isRunning ? 0.75 : 0.35);

      // 사인파를 직접 대입(set)하는 대신 살짝 감쇠(damp)해서 따라가게 하면, 걸음 자체는 여전히
      // 주기적이고 또렷하지만 관절이 무게감 있게 "따라오는" 느낌이 붙고, 다른 상태(정지/이모트 등)에서
      // 막 전환된 순간에도 값이 툭 튀지 않고 부드럽게 이어집니다.
      lerpX(leftUpLeg, swing, 22);
      lerpX(rightUpLeg, swingOpp, 22);
      lerpX(leftLeg, kneeBend(walkPhase.current + Math.PI), 22);
      lerpX(rightLeg, kneeBend(walkPhase.current), 22);
      lerpX(leftArm, swingOpp * armAmount, 18);
      lerpX(rightArm, swing * armAmount, 18);
      lerpX(leftForearm, elbowBend(walkPhase.current), 18);
      lerpX(rightForearm, elbowBend(walkPhase.current + Math.PI), 18);
      lerpX(spine, isRunning ? -0.16 : -0.04, 8); // 달릴수록 상체를 앞으로 더 기울여 역동적으로
      lerpY(spine, Math.sin(walkPhase.current) * (isRunning ? 0.1 : 0.05), 10);
      lerpZ(tailRef, Math.sin(walkPhase.current) * 0.35, 10);
      lerpX(headRef, Math.sin(walkPhase.current * 2) * (isRunning ? 0.05 : 0.02), 10); // 보폭에 맞춘 아주 미세한 머리 끄덕임
    } else {
      // 정지 시 모든 관절을 부드럽게 rest pose(0)로 복귀
      lerpX(leftUpLeg, 0, 10);
      lerpX(rightUpLeg, 0, 10);
      lerpX(leftLeg, 0, 10);
      lerpX(rightLeg, 0, 10);
      lerpX(leftArm, 0, 10);
      lerpX(rightArm, 0, 10);
      lerpX(leftForearm, 0.12, 10); // 완전히 일직선인 팔은 마네킹처럼 보여서, 아주 살짝 굽혀 힘 뺀 느낌을 줌
      lerpX(rightForearm, 0.12, 10);
      lerpX(spine, 0, 10);
      lerpY(spine, 0, 10);
      // 가만히 있을 땐 꼬리를 천천히 흔들고, 이따금 고개를 갸웃해 생동감 부여
      lerpZ(tailRef, Math.sin(t * 2) * 0.12, 8);
      lerpZ(headRef, Math.sin(t * 0.6) * 0.08, 4);
      lerpX(headRef, 0, 6);
      walkPhase.current = 0;
    }
  });

  const translucent = !!preset.translucent;

  return (
    <group ref={group}>
      {/* hips (root) */}
      <group>
        {/* 다리 (엉덩이 관절이 hips 기준 y=0.9 높이) */}
        <group position={[-0.13, 0.9, 0]}>
          <Limb jointRef={leftUpLeg} length={0.45} radius={0.09} color={preset.accent} translucent={translucent}>
            <group position={[0, -0.45, 0]} ref={leftLeg}>
              <mesh castShadow position={[0, -0.225, 0]}>
                <capsuleGeometry args={[0.075, 0.3, 6, 12]} />
                <Mat color={preset.skin} translucent={translucent} />
              </mesh>
              {/* 신발 */}
              <RoundedBox castShadow args={[0.11, 0.08, 0.16]} radius={0.03} smoothness={3} position={[0, -0.4, 0.02]}>
                <Mat color={preset.accent} translucent={translucent} />
              </RoundedBox>
            </group>
          </Limb>
        </group>
        <group position={[0.13, 0.9, 0]}>
          <Limb jointRef={rightUpLeg} length={0.45} radius={0.09} color={preset.accent} translucent={translucent}>
            <group position={[0, -0.45, 0]} ref={rightLeg}>
              <mesh castShadow position={[0, -0.225, 0]}>
                <capsuleGeometry args={[0.075, 0.3, 6, 12]} />
                <Mat color={preset.skin} translucent={translucent} />
              </mesh>
              <RoundedBox castShadow args={[0.11, 0.08, 0.16]} radius={0.03} smoothness={3} position={[0, -0.4, 0.02]}>
                <Mat color={preset.accent} translucent={translucent} />
              </RoundedBox>
            </group>
          </Limb>
        </group>

        {preset.tail && (
          <group position={[0, 0.95, -0.14]} ref={tailRef}>
            <mesh castShadow position={[0, 0.02, -0.1]} rotation={[0.9, 0, 0]}>
              <capsuleGeometry args={[0.045, 0.32, 6, 10]} />
              <Mat color={preset.body} />
            </mesh>
            <mesh castShadow position={[0, 0.1, -0.28]}>
              <sphereGeometry args={[0.05, 10, 10]} />
              <Mat color={preset.accent} />
            </mesh>
          </group>
        )}

        {/* 상체 (spine): 몸통 + 팔 + 머리가 전부 여기 매달림 */}
        <group position={[0, 0.9, 0]} ref={spine}>
          <RoundedBox castShadow args={[0.44, 0.46, 0.27]} radius={0.09} smoothness={4} position={[0, 0.24, 0]}>
            <Mat color={preset.body} metal={preset.metal} translucent={translucent} />
          </RoundedBox>
          {/* 허리~가슴 사이 굴곡을 살짝 표현 */}
          <mesh castShadow position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.16, 0.19, 0.14, 16]} />
            <Mat color={preset.accent} translucent={translucent} />
          </mesh>

          {preset.pack && (
            <>
              <RoundedBox castShadow args={[0.3, 0.34, 0.13]} radius={0.05} smoothness={3} position={[0, 0.26, -0.19]}>
                <Mat color={preset.accent} metal />
              </RoundedBox>
              <RoundedBox castShadow args={[0.14, 0.12, 0.05]} radius={0.02} smoothness={2} position={[0, 0.22, 0.15]}>
                <Mat color={preset.accent} metal />
              </RoundedBox>
              <mesh position={[0, 0.22, 0.18]}><sphereGeometry args={[0.02, 8, 8]} /><Mat color="#ff5a5a" glow /></mesh>
            </>
          )}

          {preset.robe && (
            <mesh castShadow position={[0, -0.55, 0]}>
              <coneGeometry args={[0.42, 1.05, 20, 1, true]} />
              <Mat color={preset.body} translucent />
            </mesh>
          )}

          <group position={[-0.32, 0.4, 0]}>
            <Limb jointRef={leftArm} length={0.35} radius={0.06} color={preset.body} translucent={translucent}>
              <group position={[0, -0.35, 0]} ref={leftForearm}>
                <mesh castShadow position={[0, 0, 0]}>
                  <capsuleGeometry args={[0.055, 0.24, 6, 12]} />
                  <Mat color={preset.skin} translucent={translucent} />
                </mesh>
                <mesh castShadow position={[0, -0.15, 0]}>
                  <sphereGeometry args={[0.06, 10, 10]} />
                  <Mat color={preset.skin} translucent={translucent} />
                </mesh>
              </group>
            </Limb>
          </group>
          <group position={[0.32, 0.4, 0]}>
            <Limb jointRef={rightArm} length={0.35} radius={0.06} color={preset.body} translucent={translucent}>
              <group position={[0, -0.35, 0]} ref={rightForearm}>
                <mesh castShadow position={[0, 0, 0]}>
                  <capsuleGeometry args={[0.055, 0.24, 6, 12]} />
                  <Mat color={preset.skin} translucent={translucent} />
                </mesh>
                <mesh castShadow position={[0, -0.15, 0]}>
                  <sphereGeometry args={[0.06, 10, 10]} />
                  <Mat color={preset.skin} translucent={translucent} />
                </mesh>
              </group>
            </Limb>
          </group>

          <group ref={headRef}>
            <Head preset={preset} />
          </group>
        </group>
      </group>
    </group>
  );
}
