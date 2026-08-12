import React, { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { localPlayerPosition } from "../state/localPlayerPosition.js";

/**
 * 기존 OrbitControls는 시점 중심(target)이 원점에 고정되어 있어서
 * 캐릭터가 이동하면 화면 밖으로 벗어나는 문제가 있었습니다.
 * 매 프레임 target을 로컬 플레이어 위치로 부드럽게 이동시키고,
 * 카메라도 같은 만큼 평행 이동시켜서 사용자의 회전/줌은 그대로 유지한 채
 * 캐릭터를 계속 화면 중심 근처에 따라오게 합니다.
 */
export default function CameraRig() {
  const controlsRef = useRef();
  const { camera } = useThree();
  const smoothedTarget = useRef(new THREE.Vector3(0, 0.9, 0));
  const initialized = useRef(false);

  useFrame(() => {
    const desired = new THREE.Vector3(
      localPlayerPosition.x,
      localPlayerPosition.y + 0.9,
      localPlayerPosition.z
    );

    if (!initialized.current) {
      // 최초 프레임엔 즉시 스냅해서 원점에서 카메라가 미끄러져 오는 것을 방지
      smoothedTarget.current.copy(desired);
      camera.position.add(desired);
      initialized.current = true;
    }

    const prev = smoothedTarget.current.clone();
    smoothedTarget.current.lerp(desired, 0.12);
    const delta = smoothedTarget.current.clone().sub(prev);

    camera.position.add(delta);

    if (controlsRef.current) {
      controlsRef.current.target.copy(smoothedTarget.current);
      controlsRef.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={false}
      minDistance={3}
      maxDistance={14}
      maxPolarAngle={Math.PI / 2.1}
    />
  );
}
