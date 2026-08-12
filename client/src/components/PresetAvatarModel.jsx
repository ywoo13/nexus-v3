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
const RETURN_LERP = 0.12;

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
 * 외부 GLB/API 없이 코드로 직접 만든 캐릭터를 렌더링하고, AvatarModel.jsx(예전 GLB 아바타용)와
 * 동일한 걷기/정지 애니메이션 수식을 그대로 재사용합니다 — 다만 GLTF 본(bone) 대신
 * 코드로 만든 관절 그룹(useRef)을 직접 회전시킵니다. 로딩이 필요 없어 Suspense도 필요 없습니다.
 */
export default function PresetAvatarModel({ presetId, movingRef, runningRef, groundedRef, offsetY = 0 }) {
  const preset = useMemo(() => getAvatarPreset(presetId), [presetId]);
  const group = useRef();
  const walkPhase = useRef(0);

  const spine = useRef();
  const leftUpLeg = useRef();
  const leftLeg = useRef();
  const rightUpLeg = useRef();
  const rightLeg = useRef();
  const leftArm = useRef();
  const rightArm = useRef();
  const tailRef = useRef();

  useFrame((state, delta) => {
    if (!group.current) return;
    const isMoving = !!movingRef?.current;
    const isRunning = !!runningRef?.current;
    const isGrounded = groundedRef ? groundedRef.current !== false : true;

    // 항상 적용되는 가벼운 숨쉬기(idle) 상하 움직임
    group.current.position.y = offsetY + Math.sin(state.clock.elapsedTime * 1.5) * 0.01;

    const setX = (ref, v) => ref.current && (ref.current.rotation.x = v);
    const lerpX = (ref, target, t) => ref.current && (ref.current.rotation.x = THREE.MathUtils.lerp(ref.current.rotation.x, target, t));
    const lerpY = (ref, target, t) => ref.current && (ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, target, t));
    const lerpZ = (ref, target, t) => ref.current && (ref.current.rotation.z = THREE.MathUtils.lerp(ref.current.rotation.z, target, t));

    if (!isGrounded) {
      // 공중에 떠 있을 때: 다리를 살짝 접은 점프 포즈로 고정
      lerpX(leftUpLeg, 0.35, 0.3);
      lerpX(rightUpLeg, 0.35, 0.3);
      lerpX(leftLeg, 0.55, 0.3);
      lerpX(rightLeg, 0.55, 0.3);
      lerpX(leftArm, -0.4, 0.3);
      lerpX(rightArm, -0.4, 0.3);
      walkPhase.current = 0;
    } else if (isMoving) {
      const speedMultiplier = isRunning ? 1.7 : 1;
      const swingAmount = isRunning ? 0.75 : 0.5;
      const armAmount = isRunning ? 0.9 : 0.6;

      walkPhase.current += delta * WALK_SPEED * speedMultiplier;
      const swing = Math.sin(walkPhase.current) * swingAmount;
      const swingOpp = -swing;
      const kneeBend = (phase) => Math.max(0, Math.sin(phase)) * (isRunning ? 0.9 : 0.6);

      setX(leftUpLeg, swing);
      setX(rightUpLeg, swingOpp);
      setX(leftLeg, kneeBend(walkPhase.current + Math.PI));
      setX(rightLeg, kneeBend(walkPhase.current));
      setX(leftArm, swingOpp * armAmount);
      setX(rightArm, swing * armAmount);
      lerpY(spine, Math.sin(walkPhase.current) * (isRunning ? 0.08 : 0.05), 0.5);
      lerpZ(tailRef, Math.sin(walkPhase.current) * 0.35, 0.4);
    } else {
      // 정지 시 모든 관절을 부드럽게 rest pose(0)로 복귀
      lerpX(leftUpLeg, 0, RETURN_LERP);
      lerpX(rightUpLeg, 0, RETURN_LERP);
      lerpX(leftLeg, 0, RETURN_LERP);
      lerpX(rightLeg, 0, RETURN_LERP);
      lerpX(leftArm, 0, RETURN_LERP);
      lerpX(rightArm, 0, RETURN_LERP);
      lerpY(spine, 0, RETURN_LERP);
      // 가만히 있을 땐 꼬리를 천천히 흔들어 생동감 부여
      lerpZ(tailRef, Math.sin(state.clock.elapsedTime * 2) * 0.12, 0.2);
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
              <mesh castShadow position={[0, -0.35, 0]}>
                <capsuleGeometry args={[0.055, 0.24, 6, 12]} />
                <Mat color={preset.skin} translucent={translucent} />
              </mesh>
              <mesh castShadow position={[0, -0.5, 0]}>
                <sphereGeometry args={[0.06, 10, 10]} />
                <Mat color={preset.skin} translucent={translucent} />
              </mesh>
            </Limb>
          </group>
          <group position={[0.32, 0.4, 0]}>
            <Limb jointRef={rightArm} length={0.35} radius={0.06} color={preset.body} translucent={translucent}>
              <mesh castShadow position={[0, -0.35, 0]}>
                <capsuleGeometry args={[0.055, 0.24, 6, 12]} />
                <Mat color={preset.skin} translucent={translucent} />
              </mesh>
              <mesh castShadow position={[0, -0.5, 0]}>
                <sphereGeometry args={[0.06, 10, 10]} />
                <Mat color={preset.skin} translucent={translucent} />
              </mesh>
            </Limb>
          </group>

          <Head preset={preset} />
        </group>
      </group>
    </group>
  );
}
