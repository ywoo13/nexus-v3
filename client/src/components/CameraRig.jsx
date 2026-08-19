import React, { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { localPlayerPosition } from "../state/localPlayerPosition.js";

// 캐릭터 발밑 기준 좌표를 그대로 그룹 위치로 쓰고, 카메라가 바라보는 높이(가슴 정도)만큼
// 위로 띄운 지점을 orbit 대상으로 삼습니다. 그룹 로컬 좌표라서 항상 이 고정값이면 충분합니다.
const LOOK_HEIGHT = 0.9;
const FOLLOW_LAMBDA = 8; // 그룹이 캐릭터를 따라가는 속도(감쇠 계수) — THREE.MathUtils.damp에 사용

/**
 * v1에서는 매 프레임 camera.position과 OrbitControls.target을 동시에 손으로 옮기고
 * controls.update()를 호출하는 방식이었습니다. 문제는 OrbitControls가 드래그(회전) 중일 때
 * 포인터 이벤트 핸들러 안에서도 자체적으로 update()를 호출한다는 점입니다 — 그 시점엔 아직
 * 이번 프레임의 새 target이 반영되기 전이라, "이벤트가 준 update()"와 "우리 useFrame이 준
 * update()"가 서로 다른 target 기준으로 camera.position을 두 번 다시 계산하게 됩니다.
 * 캐릭터가 가만히 있으면 target이 안 바뀌니 문제가 없지만, 걸으면서 동시에 화면을 드래그하면
 * 이 불일치가 프레임마다 반복되어 카메라가 심하게 떨리고(전형적인 "흔들림") 버벅이는 것처럼 보입니다.
 *
 * v2 해결책: OrbitControls의 target을 아예 건드리지 않습니다(고정값 (0, LOOK_HEIGHT, 0)).
 * 대신 카메라 자체를 "캐릭터를 따라가는 그룹" 안의 자식으로 두고, 그 그룹만 매 프레임 캐릭터
 * 위치로 부드럽게 이동시킵니다. OrbitControls는 그룹의 로컬 좌표계 안에서 고정된 한 점을
 * 중심으로 순수하게 회전/줌만 담당하게 되어, 우리의 추적 로직과 절대 서로 간섭하지 않습니다.
 */
export default function CameraRig() {
  const followGroup = useRef();
  const controlsRef = useRef();
  const initialized = useRef(false);

  useEffect(() => {
    // target은 그룹 로컬 좌표 기준 고정값이라 최초 한 번만 설정하면 됩니다.
    // (enablePan이 꺼져 있어서 이후 어떤 조작으로도 target이 움직이지 않음)
    controlsRef.current?.target.set(0, LOOK_HEIGHT, 0);
    controlsRef.current?.update();
  }, []);

  useFrame((_, delta) => {
    const group = followGroup.current;
    if (!group) return;

    if (!initialized.current) {
      // 최초 프레임엔 즉시 스냅해서 원점에서 카메라가 미끄러져 오는 것을 방지
      group.position.set(localPlayerPosition.x, localPlayerPosition.y, localPlayerPosition.z);
      initialized.current = true;
    } else {
      group.position.x = THREE.MathUtils.damp(group.position.x, localPlayerPosition.x, FOLLOW_LAMBDA, delta);
      group.position.y = THREE.MathUtils.damp(group.position.y, localPlayerPosition.y, FOLLOW_LAMBDA, delta);
      group.position.z = THREE.MathUtils.damp(group.position.z, localPlayerPosition.z, FOLLOW_LAMBDA, delta);
    }

    // enableDamping을 쓰기 때문에 매 프레임 호출이 필요합니다(관성 감쇠 계산).
    // target은 안 건드리므로 이 update()는 순수하게 회전/줌 관성만 처리합니다.
    controlsRef.current?.update();
  });

  return (
    <group ref={followGroup}>
      <PerspectiveCamera makeDefault position={[0, 4, 8]} fov={50} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.12}
        minDistance={3}
        maxDistance={14}
        maxPolarAngle={Math.PI / 2.1}
      />
    </group>
  );
}
