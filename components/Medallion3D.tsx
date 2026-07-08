"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

function Medallion() {
  const group = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (group.current) {
      group.current.rotation.y += delta * 0.22;
    }
  });

  return (
    <group ref={group} rotation={[0.35, 0, 0]}>
      {/* Coin body */}
      <mesh receiveShadow castShadow>
        <cylinderGeometry args={[1.5, 1.5, 0.22, 72]} />
        <meshStandardMaterial color="#c9a24e" metalness={0.85} roughness={0.32} />
      </mesh>

      {/* Rim highlight */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.5, 0.055, 16, 72]} />
        <meshStandardMaterial color="#e1be64" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Inner stamped disc */}
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[1.08, 1.08, 0.05, 72]} />
        <meshStandardMaterial color="#3a2314" metalness={0.25} roughness={0.65} />
      </mesh>

      {/* Center emblem ring */}
      <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.62, 0.03, 12, 48]} />
        <meshStandardMaterial color="#e1be64" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Small central boss */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.08, 48]} />
        <meshStandardMaterial color="#c9a24e" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

export default function Medallion3D() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.6, 4.2], fov: 40 }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[2.5, 3, 2]} intensity={1.4} color="#fff3d6" castShadow />
      <pointLight position={[-2.5, -1, -2]} intensity={0.6} color="#e1be64" />
      <pointLight position={[0, -2, 2]} intensity={0.3} color="#ffffff" />
      <Medallion />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        minPolarAngle={Math.PI / 2.6}
        maxPolarAngle={Math.PI / 1.7}
        rotateSpeed={0.5}
        enableDamping
        dampingFactor={0.08}
      />
    </Canvas>
  );
}
