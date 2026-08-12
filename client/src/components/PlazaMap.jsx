import React, { Suspense, useEffect, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import PlazaBackdrop from "./PlazaBackdrop.jsx";
import PlazaProps from "./PlazaProps.jsx";

const MAP_URL = "/models/plaza.glb";
// 이 주기로 plaza.glb 가 여전히 서버에 있는지 확인합니다.
// 파일이 지워지면 이 폴링이 감지해서 자동으로 임시 배경(FallbackMap)으로 되돌립니다.
const CHECK_INTERVAL_MS = 5000;

// GLTF 씬의 geometry/material/texture를 전부 dispose 해서
// GPU/메모리에 아무것도 남지 않게 합니다. (이게 없으면 언마운트 후에도
// 예전 모델의 리소스가 살아있어서 잔상처럼 보이거나 메모리가 샙니다.)
function disposeScene(scene) {
  if (!scene) return;
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((mat) => {
        Object.keys(mat).forEach((key) => {
          const value = mat[key];
          if (value && typeof value.dispose === "function") value.dispose(); // 텍스처 등
        });
        mat.dispose();
      });
    }
  });
}

function FallbackMap() {
  // client/public/models/plaza.glb 이 없을 때(또는 방금 지워졌을 때) 보여주는 임시 배경 (바닥 포함).
  return (
    <>
      <RigidBody type="fixed">
        <CuboidCollider args={[20, 0.1, 20]} position={[0, -0.1, 0]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#e7edf1" roughness={0.9} />
        </mesh>
      </RigidBody>
      <PlazaBackdrop />
      <PlazaProps />
    </>
  );
}

function RealMap() {
  const { scene } = useGLTF(MAP_URL);

  useEffect(() => {
    // 언마운트될 때(=임시 배경으로 전환될 때) 씬을 완전히 정리하고,
    // drei의 useGLTF 캐시도 함께 비웁니다. 캐시를 안 비우면 파일을 다시 넣었을 때도
    // 예전에 로드했던(이미 dispose된) 씬 객체를 그대로 재사용하려고 해서 잔상/에러가 납니다.
    return () => {
      disposeScene(scene);
      useGLTF.clear(MAP_URL);
    };
  }, [scene]);

  return (
    // colliders="trimesh": 모델 형태 그대로 충돌체를 만들어줍니다 (복잡한 지형에 적합).
    // 씬이 아주 무거워지면 trimesh 대신 눈에 안 보이는 단순 콜라이더를 따로 배치하는 걸 고려하세요.
    <RigidBody type="fixed" colliders="trimesh">
      <primitive object={scene} />
    </RigidBody>
  );
}

// useGLTF는 로딩 중엔 Suspense로 잡히지만, 파일이 없어서 실패(404 등)하면
// 렌더링 중 에러를 던지므로 별도 에러 바운더리로 잡아서 임시 배경으로 대체합니다.
class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.info(
      "[Nexus] client/public/models/plaza.glb 를 찾지 못해 임시 배경을 대신 표시합니다.",
      error?.message
    );
    // 상위(PlazaMap)에도 알려서 폴링을 기다리지 않고 바로 available=false로 전환시킵니다.
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

export default function PlazaMap() {
  // plaza.glb가 지금 실제로 서버에 있는지 여부.
  // false가 되는 순간 RealMap 쪽 서브트리 전체가 언마운트되면서
  // RigidBody/충돌체/geometry가 깨끗하게 정리되고 FallbackMap으로 교체됩니다.
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkFile() {
      try {
        // cache: "no-store" + 캐시버스팅 쿼리로 브라우저 캐시를 완전히 무시하고
        // 매번 서버에 실제로 파일이 있는지 물어봅니다.
        // (이게 없으면 파일을 지워도 브라우저가 예전 200 응답을 그대로 재사용해서
        //  "지웠는데도 계속 보이는" 잔상 문제가 생깁니다.)
        const res = await fetch(`${MAP_URL}?_=${Date.now()}`, {
          method: "HEAD",
          cache: "no-store",
        });
        if (!cancelled) setAvailable(res.ok);
      } catch {
        if (!cancelled) setAvailable(false);
      }
    }

    checkFile();
    const id = setInterval(checkFile, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!available) {
    return <FallbackMap />;
  }

  return (
    <MapErrorBoundary fallback={<FallbackMap />} onError={() => setAvailable(false)}>
      <Suspense fallback={<FallbackMap />}>
        <RealMap />
      </Suspense>
    </MapErrorBoundary>
  );
}
