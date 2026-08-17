import React, { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RigidBody, CapsuleCollider } from "@react-three/rapier";
import * as THREE from "three";
import { sendMove } from "../network/room.js";
import { usePlayersStore } from "../state/store.js";
import { movementInput, bindKeyboard, jumpRequest } from "../input/movementInput.js";
import { localPlayerPosition } from "../state/localPlayerPosition.js";
import PresetAvatarModel from "./PresetAvatarModel.jsx";

const WALK_SPEED = 4;
const RUN_SPEED = 7.5;
const ACCEL_LAMBDA = 10; // 클수록 목표 속도에 더 빨리 도달 (가속/감속 느낌)
const JUMP_SPEED = 5.5;
const JUMP_COOLDOWN_MS = 300; // 점프 정점에서 수직 속도가 잠깐 0에 가까워질 때 이중 점프되는 것 방지
const GROUND_VELOCITY_EPSILON = 0.6; // 이 값보다 수직 속도가 작으면 "바닥에 닿아있다"로 판단
const CAPSULE_RADIUS = 0.35;
const CAPSULE_HALF_HEIGHT = 0.45;
const CAPSULE_TOTAL_HALF = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS; // 0.8 (콜라이더 중심 ~ 바닥 거리)

export default function LocalPlayerController() {
  const rigidBody = useRef(null);
  const visualGroup = useRef();
  const lastSent = useRef(0);
  const movingRef = useRef(false);
  const runningRef = useRef(false);
  const groundedRef = useRef(true);
  const facing = useRef(0);
  const spawned = useRef(false);
  const sessionId = usePlayersStore((s) => s.sessionId);
  const selfData = usePlayersStore((s) => s.players[sessionId]);
  const mapId = usePlayersStore((s) => s.mapId);

  const lastJumpAt = useRef(-Infinity);
  const verticalVelocityRef = useRef(0); // 상승/하강 포즈 구분용 — PresetAvatarModel에 그대로 전달
  const { camera } = useThree();
  // 카메라 정면/우측 방향을 매 프레임 재계산하기 위한 스크래치 벡터 (매 프레임 new Vector3 생성 방지)
  const camForward = useRef(new THREE.Vector3());
  const camRight = useRef(new THREE.Vector3());
  const worldUp = useRef(new THREE.Vector3(0, 1, 0));
  // 매 프레임 new THREE.Vector3()를 새로 만들면 초당 수십~수백 개의 객체가 생성되어
  // 불필요한 GC(가비지 컬렉션) 압박을 줍니다. 재사용 가능한 스크래치 벡터를 하나 두고
  // 매 프레임 값만 덮어써서 할당을 없앱니다.
  const dir = useRef(new THREE.Vector3());

  useEffect(() => bindKeyboard(), []);

  // 이 컴포넌트는 방을 옮겨도(World.jsx의 mapId 스위치) 다시 마운트되지 않고 계속 살아있으므로,
  // spawned.current를 그대로 두면 새 방에서도 예전 방의 물리 위치에 그대로 남아있게 됩니다.
  // mapId가 바뀔 때마다 "아직 스폰 안 됨" 상태로 되돌려서, 다음 프레임에 서버가 새로 배정한
  // 위치(selfData.x/z)로 다시 순간이동하도록 합니다.
  useEffect(() => {
    spawned.current = false;
  }, [mapId]);

  useFrame((state, delta) => {
    const rb = rigidBody.current;
    if (!rb) return;

    // 서버가 배정한 초기 스폰 위치 반영 (최초 1회)
    if (!spawned.current && selfData) {
      rb.setTranslation({ x: selfData.x, y: CAPSULE_TOTAL_HALF, z: selfData.z }, true);
      spawned.current = true;
    }

    // 키보드(WASD)와 터치 D패드가 공유하는 입력값 (movementInput.js)
    // ⚠️ 이전에는 이 (x, z)를 월드 좌표축 그대로 이동 방향으로 썼습니다. OrbitControls로
    // 카메라를 회전시켜도 "앞"은 항상 월드 -Z축이었기 때문에, 카메라를 90도 돌리면
    // W를 눌러도 화면상 옆으로 미끄러지듯 움직이는 버그가 있었습니다.
    // 아래처럼 카메라의 수평 방향(azimuth) 기준으로 입력을 재투영해서, 카메라가 어느
    // 방향을 보고 있든 "앞(W)"은 항상 화면 위쪽, "오른쪽(D)"은 항상 화면 오른쪽이 되도록 고칩니다.
    camera.getWorldDirection(camForward.current);
    camForward.current.y = 0;
    if (camForward.current.lengthSq() < 1e-6) camForward.current.set(0, 0, -1);
    camForward.current.normalize();
    camRight.current.crossVectors(camForward.current, worldUp.current).normalize();

    dir.current.set(0, 0, 0);
    dir.current.addScaledVector(camForward.current, -movementInput.z); // z=-1(전진) → 카메라가 보는 방향으로 전진
    dir.current.addScaledVector(camRight.current, movementInput.x); // x=+1(오른쪽) → 카메라 기준 오른쪽으로 이동

    const isMoving = dir.current.lengthSq() > 0.0001;
    movingRef.current = isMoving;
    if (dir.current.length() > 1) dir.current.normalize();

    const pos = rb.translation();
    const currentVel = rb.linvel();

    // 바닥 y좌표가 항상 0이라고 가정하면 계단/단상 등 높이가 다른 실제 맵에서는
    // 영원히 "공중"으로 판정되는 문제가 있었습니다. 대신 수직 속도가 거의 0인지로 판단하면
    // 지형 높이와 무관하게 동작합니다 (점프 정점에서 잠깐 0에 가까워지는 것은 쿨다운으로 방지).
    const canJumpAgain = state.clock.elapsedTime * 1000 - lastJumpAt.current > JUMP_COOLDOWN_MS;
    const grounded = Math.abs(currentVel.y) < GROUND_VELOCITY_EPSILON && canJumpAgain;
    groundedRef.current = grounded;

    const targetSpeed = movementInput.run ? RUN_SPEED : WALK_SPEED;
    runningRef.current = movementInput.run && isMoving;
    const targetVelX = isMoving ? dir.current.x * targetSpeed : 0;
    const targetVelZ = isMoving ? dir.current.z * targetSpeed : 0;

    // 즉시 목표 속도로 튀지 않고, 지수 감쇠로 부드럽게 가속/감속
    const newVelX = THREE.MathUtils.damp(currentVel.x, targetVelX, ACCEL_LAMBDA, delta);
    const newVelZ = THREE.MathUtils.damp(currentVel.z, targetVelZ, ACCEL_LAMBDA, delta);

    let newVelY = currentVel.y;
    if (jumpRequest.pending) {
      jumpRequest.pending = false;
      if (grounded) {
        newVelY = JUMP_SPEED;
        lastJumpAt.current = state.clock.elapsedTime * 1000;
      }
    }

    rb.setLinvel({ x: newVelX, y: newVelY, z: newVelZ }, true);
    verticalVelocityRef.current = newVelY;

    if (isMoving) {
      facing.current = Math.atan2(dir.current.x, dir.current.z);
    }

    if (visualGroup.current) {
      visualGroup.current.rotation.y = THREE.MathUtils.lerp(
        visualGroup.current.rotation.y,
        facing.current,
        0.25
      );
    }

    // 네트워크 부하를 줄이면서도 원격 보간 지연을 줄이기 위해 초당 약 20회로 이동 정보 전송
    lastSent.current += delta;
    if (lastSent.current > 1 / 20) {
      lastSent.current = 0;
      sendMove(pos.x, pos.y, pos.z, facing.current);
    }

    // 카메라가 따라올 수 있도록 최신 위치를 공유 상태에 반영
    localPlayerPosition.x = pos.x;
    localPlayerPosition.y = pos.y;
    localPlayerPosition.z = pos.z;
  });

  return (
    <RigidBody
      ref={rigidBody}
      type="dynamic"
      colliders={false}
      mass={1}
      enabledRotations={[false, false, false]}
      linearDamping={0.5}
      position={[0, CAPSULE_TOTAL_HALF, 0]}
    >
      <CapsuleCollider args={[CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS]} />
      <group ref={visualGroup}>
        <PresetAvatarModel
          presetId={selfData?.avatarPreset}
          movingRef={movingRef}
          runningRef={runningRef}
          groundedRef={groundedRef}
          verticalVelocityRef={verticalVelocityRef}
          emote={selfData?.emote}
          offsetY={-CAPSULE_TOTAL_HALF}
        />
      </group>
    </RigidBody>
  );
}
