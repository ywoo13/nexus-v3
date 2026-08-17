import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { RigidBody, CapsuleCollider } from "@react-three/rapier";
import * as THREE from "three";
import PresetAvatarModel from "./PresetAvatarModel.jsx";

const CAPSULE_RADIUS = 0.35;
const CAPSULE_HALF_HEIGHT = 0.45;
const CAPSULE_TOTAL_HALF = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS; // 0.8 (콜라이더 중심 ~ 바닥 거리)
const LERP_FACTOR = 0.3; // 클수록 네트워크 스냅샷을 더 빨리 따라잡음 (원격-로컬 충돌 위치 오차 감소)
const RUN_DISTANCE_THRESHOLD = 0.02; // 프레임당 이 정도 이상 보간 이동하면 "달리는 중"으로 간주
const VERTICAL_STILL_THRESHOLD = 0.01; // 프레임당 y 변화가 이보다 작으면 "바닥에 닿아있다"로 간주
const NAME_Y = 1.25;
const EMOTE_Y = 1.55;

export default function Player({ data }) {
  const rigidBody = useRef(null);
  const visualGroup = useRef();
  const currentPos = useRef(new THREE.Vector3(data.x, data.y || CAPSULE_TOTAL_HALF, data.z));
  const target = useRef(new THREE.Vector3(data.x, data.y || CAPSULE_TOTAL_HALF, data.z));
  const movingRef = useRef(false);
  const runningRef = useRef(false);
  const groundedRef = useRef(true);
  const verticalVelocityRef = useRef(0); // 프레임 간 y 변화량으로 추정한 속도 — 상승/하강 포즈 구분용

  target.current.set(data.x, data.y || CAPSULE_TOTAL_HALF, data.z);

  // 서버 스냅샷 사이를 부드럽게 보간하고, kinematic 콜라이더 위치도 같이 갱신
  // (덕분에 로컬 플레이어가 다른 유저 몸을 실제로 뚫고 지나가지 못함)
  // y값도 함께 보간하기 때문에 다른 유저의 점프도 그대로 보임
  useFrame((_, delta) => {
    const rb = rigidBody.current;
    if (!rb) return;

    const before = currentPos.current.clone();
    currentPos.current.lerp(target.current, LERP_FACTOR);
    const moveDist = currentPos.current.distanceTo(before);

    movingRef.current = moveDist > 0.0008;
    runningRef.current = moveDist > RUN_DISTANCE_THRESHOLD;
    // 절대 y좌표(바닥이 항상 0이라는 가정) 대신 프레임간 y 변화량으로 판단하면
    // 지형 높이가 다른 실제 맵에서도 "공중에 떠있는지"를 올바르게 구분할 수 있습니다.
    groundedRef.current = Math.abs(currentPos.current.y - before.y) < VERTICAL_STILL_THRESHOLD;
    // 실제 물리 속도는 알 수 없지만(원격 플레이어는 위치만 보간), y 변화량/delta로 대략적인
    // 수직 속도를 추정해두면 PresetAvatarModel이 상승/하강 포즈를 구분하는 데 충분합니다.
    if (delta > 0) verticalVelocityRef.current = (currentPos.current.y - before.y) / delta;

    rb.setNextKinematicTranslation(currentPos.current);

    if (visualGroup.current) {
      visualGroup.current.rotation.y = THREE.MathUtils.lerp(
        visualGroup.current.rotation.y,
        data.rotationY ?? 0,
        0.2
      );
    }
  });

  return (
    <RigidBody
      ref={rigidBody}
      type="kinematicPosition"
      colliders={false}
      position={[data.x, data.y || CAPSULE_TOTAL_HALF, data.z]}
    >
      <CapsuleCollider args={[CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS]} />

      <group ref={visualGroup}>
        <PresetAvatarModel
          presetId={data.avatarPreset}
          movingRef={movingRef}
          runningRef={runningRef}
          groundedRef={groundedRef}
          verticalVelocityRef={verticalVelocityRef}
          emote={data.emote}
          offsetY={-CAPSULE_TOTAL_HALF}
        />
      </group>

      <Text
        position={[0, NAME_Y, 0]}
        fontSize={0.22}
        color="#1f2937"
        anchorX="center"
        outlineWidth={0.012}
        outlineColor="#ffffff"
      >
        {data.isAdmin ? `👑 ${data.name}` : data.verified ? `✓ ${data.name}` : data.name}
      </Text>
      {data.emote && (
        <Text
          position={[0, EMOTE_Y, 0]}
          fontSize={0.3}
          anchorX="center"
          outlineWidth={0.01}
          outlineColor="#ffffff"
        >
          {data.emote}
        </Text>
      )}
    </RigidBody>
  );
}
