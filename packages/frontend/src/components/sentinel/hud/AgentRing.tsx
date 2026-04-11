import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { AgentRingStatus } from '../../../stores/missionStore';

const RING_SIZE = 160;
/** Dense outer band — reference “shimmering sand” grain */
const PARTICLE_COUNT = 5600;
const WAVE_SEGMENTS = 480;
const RIPPLE_COUNT = 6;

type Props = {
    status: AgentRingStatus;
    /** Written by parent at ~30 fps. Animation loop reads directly — no re-render cost. */
    amplitudeRef?: React.MutableRefObject<number>;
};

/** Cheap 1D pseudo-noise for organic displacement (no texture deps). */
function warp(a: number, t: number): number {
    return (
        Math.sin(a * 3.17 + t * 1.9) * 0.5
        + Math.sin(a * 7.91 - t * 2.4) * 0.28
        + Math.sin(a * 13.4 + t * 3.1) * 0.16
    );
}

export default function AgentRing({ status, amplitudeRef }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const frameRef = useRef<number>(0);
    const timeRef = useRef(0);
    const statusRef = useRef<AgentRingStatus>(status);
    statusRef.current = status;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const renderer = new THREE.WebGLRenderer({
            canvas,
            alpha: true,
            antialias: true,
        });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio ?? 1));
        renderer.setSize(RING_SIZE, RING_SIZE);
        renderer.setClearColor(0x000000, 0);

        const scene = new THREE.Scene();
        /** Very light depth haze — keeps core hollow without dulling the ring. */
        scene.fog = new THREE.FogExp2(0x010608, 0.022);

        const camera = new THREE.PerspectiveCamera(58, 1, 0.08, 100);
        camera.position.z = 3.35;

        const positions = new Float32Array(PARTICLE_COUNT * 3);
        const colors = new Float32Array(PARTICLE_COUNT * 3);
        const baseColors = new Float32Array(PARTICLE_COUNT * 3);
        const baseZ = new Float32Array(PARTICLE_COUNT);
        const baseAngle = new Float32Array(PARTICLE_COUNT);
        const baseRadius = new Float32Array(PARTICLE_COUNT);
        const spokePhase = new Float32Array(PARTICLE_COUNT);

        const tealCore = new THREE.Color(0x00ced1);
        const tealDeep = new THREE.Color(0x4ca2a0);
        const tealHi = new THREE.Color(0x5eead4);

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const u = i / PARTICLE_COUNT;
            const angle = u * Math.PI * 2 + (Math.random() - 0.5) * 0.09;
            baseAngle[i] = angle;
            spokePhase[i] = Math.sin(angle * 24) * 0.5 + 0.5;

            const radialT = Math.random();
            const r = THREE.MathUtils.lerp(0.9, 1.46, Math.pow(radialT, 0.58));
            baseRadius[i] = r;

            const tangential = (Math.random() - 0.5) * 0.07;
            positions[i * 3] = Math.cos(angle) * r + Math.sin(angle) * tangential;
            positions[i * 3 + 1] = Math.sin(angle) * r - Math.cos(angle) * tangential;
            const z = (Math.random() - 0.5) * 0.18;
            positions[i * 3 + 2] = z;
            baseZ[i] = z;

            const mix = spokePhase[i] * 0.55 + Math.random() * 0.45;
            const c = new THREE.Color().lerpColors(tealDeep, tealHi, mix);
            if (Math.random() < 0.22) c.lerp(tealCore, 0.55);
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
            baseColors[i * 3] = c.r;
            baseColors[i * 3 + 1] = c.g;
            baseColors[i * 3 + 2] = c.b;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.019,
            vertexColors: true,
            transparent: true,
            opacity: 0.78,
            sizeAttenuation: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        const ring = new THREE.Points(geometry, material);
        scene.add(ring);

        const linePositions = new Float32Array(WAVE_SEGMENTS * 3);
        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x40e0d0,
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const outerWaveLine = new THREE.LineLoop(lineGeometry, lineMaterial);
        scene.add(outerWaveLine);

        /** Crisp inner lip of the particle band — reference “structural anchor”. */
        const innerEdgeSeg = 180;
        const innerEdgePos = new Float32Array(innerEdgeSeg * 3);
        const innerEdgeGeo = new THREE.BufferGeometry();
        innerEdgeGeo.setAttribute('position', new THREE.BufferAttribute(innerEdgePos, 3));
        const innerEdgeMat = new THREE.LineBasicMaterial({
            color: 0x5eead4,
            transparent: true,
            opacity: 0.35,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const innerEdgeLoop = new THREE.LineLoop(innerEdgeGeo, innerEdgeMat);
        scene.add(innerEdgeLoop);

        /** Concentric ghost ripples — faint sonar echoes between core and outer shell. */
        const rippleMeshes: THREE.Mesh[] = [];
        const rippleMats: THREE.MeshBasicMaterial[] = [];
        for (let k = 0; k < RIPPLE_COUNT; k++) {
            const t0 = k / RIPPLE_COUNT;
            const rMid = 0.38 + t0 * 0.62;
            const w = 0.012 + (1 - t0) * 0.018;
            const ringGeo = new THREE.RingGeometry(rMid - w, rMid + w, 96);
            const mat = new THREE.MeshBasicMaterial({
                color: 0x00b4c5,
                transparent: true,
                opacity: 0.045 + (1 - t0) * 0.05,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            });
            const mesh = new THREE.Mesh(ringGeo, mat);
            mesh.position.z = -0.04 - k * 0.008;
            scene.add(mesh);
            rippleMeshes.push(mesh);
            rippleMats.push(mat);
        }

        /** Geodesic “brain” — wireframe icosahedron + soft nucleus. */
        const coreGeo = new THREE.IcosahedronGeometry(0.13, 1);
        const coreMat = new THREE.MeshBasicMaterial({
            color: 0x7fffd4,
            wireframe: true,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const coreWire = new THREE.Mesh(coreGeo, coreMat);
        coreWire.position.z = 0.06;
        scene.add(coreWire);

        const nucleusGeo = new THREE.SphereGeometry(0.06, 12, 12);
        const nucleusMat = new THREE.MeshBasicMaterial({
            color: 0x00fff2,
            transparent: true,
            opacity: 0.35,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const nucleus = new THREE.Mesh(nucleusGeo, nucleusMat);
        nucleus.position.z = 0.07;
        scene.add(nucleus);

        const glowGeo = new THREE.SphereGeometry(0.28, 18, 18);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0x0d4f52,
            transparent: true,
            opacity: 0.08,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const glowMesh = new THREE.Mesh(glowGeo, glowMat);
        glowMesh.position.z = 0.02;
        scene.add(glowMesh);

        /** Precision ticks — top / bottom of outer compass. */
        const tickGeo = new THREE.BufferGeometry();
        const tickLen = 0.07;
        const tickPositions = new Float32Array([
            0,
            1.52,
            0.04,
            0,
            1.52 - tickLen,
            0.04,
            0,
            -1.52,
            0.04,
            0,
            -1.52 + tickLen,
            0.04,
        ]);
        tickGeo.setAttribute('position', new THREE.BufferAttribute(tickPositions, 3));
        const tickMat = new THREE.LineBasicMaterial({
            color: 0x7fffd4,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const ticks = new THREE.LineSegments(tickGeo, tickMat);
        scene.add(ticks);

        const redRgb = { r: 0.91, g: 0.22, b: 0.22 };

        const animate = () => {
            frameRef.current = window.requestAnimationFrame(animate);
            timeRef.current += 0.011;
            const t = timeRef.current;
            const st = statusRef.current;

            const amp = amplitudeRef ? Math.min(amplitudeRef.current, 1) : 0;
            const intensity =
                st === 'SPEAKING'
                    ? 0.26 + amp * 0.38
                    : st === 'ALERT' ? 0.2 : 0.075;

            const posArr = geometry.attributes.position.array as Float32Array;
            const colArr = geometry.attributes.color.array as Float32Array;

            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const angle = baseAngle[i];
                const br = baseRadius[i];
                const w = warp(angle * 2.1, t) * intensity;
                const w2 = warp(angle * 5.3 + 1.7, t * 1.08) * intensity * 0.65;
                const w3 = Math.sin(angle * 9 + t * 3.4) * intensity * 0.35;
                const radius = br + w + w2 + w3;

                posArr[i * 3] = Math.cos(angle) * radius;
                posArr[i * 3 + 1] = Math.sin(angle) * radius;

                let z = baseZ[i];
                if (st === 'SPEAKING') {
                    const vib = 0.04 + amp * 0.06;
                    z += Math.sin(t * 16 + i * 0.06) * vib
                       + Math.sin(t * 24 + angle * 4) * vib * 0.55;
                }
                else if (st === 'ALERT') {
                    z += Math.sin(t * 11 + i * 0.05) * 0.04;
                }
                else {
                    z += Math.sin(t * 1.15 + i * 0.035) * 0.014;
                }
                posArr[i * 3 + 2] = z;

                const br0 = baseColors[i * 3];
                const bg0 = baseColors[i * 3 + 1];
                const bb0 = baseColors[i * 3 + 2];
                const mixT = st === 'ALERT' ? 0.85 : 0;
                colArr[i * 3] = br0 * (1 - mixT) + redRgb.r * mixT;
                colArr[i * 3 + 1] = bg0 * (1 - mixT) + redRgb.g * mixT;
                colArr[i * 3 + 2] = bb0 * (1 - mixT) + redRgb.b * mixT;
            }

            geometry.attributes.position.needsUpdate = true;
            geometry.attributes.color.needsUpdate = true;

            if (st === 'SPEAKING') {
                material.opacity = 0.42 + (Math.sin(t * 8.5) * 0.5 + 0.5) * 0.32 + amp * 0.28;
                material.size = 0.019 + (Math.sin(t * 12) * 0.5 + 0.5) * 0.008 + amp * 0.006;
            }
            else if (st === 'ALERT') {
                material.opacity = 0.62 + (Math.sin(t * 4.2) * 0.5 + 0.5) * 0.32;
                material.size = 0.021;
            }
            else {
                const breath = Math.sin(t * ((Math.PI * 2) / 5));
                material.opacity = 0.58 + breath * 0.06;
                material.size = 0.019;
            }

            material.color.setRGB(1, 1, 1);

            for (let i = 0; i < WAVE_SEGMENTS; i++) {
                const u = i / WAVE_SEGMENTS;
                const angle = u * Math.PI * 2;
                const wobble =
                    warp(angle + t * 0.4, t) * intensity * 0.95
                    + Math.sin(angle * 6 - t * 2.2) * intensity * 0.35;
                const r = 1.05 + wobble + (st === 'SPEAKING' ? Math.sin(t * 12 + angle * 2) * 0.045 : 0);
                linePositions[i * 3] = Math.cos(angle) * r;
                linePositions[i * 3 + 1] = Math.sin(angle) * r;
                linePositions[i * 3 + 2] = -0.015;
            }
            lineGeometry.attributes.position.needsUpdate = true;

            const innerR = 0.88 + Math.sin(t * 1.8) * 0.012 + (st === 'SPEAKING' ? Math.sin(t * 9) * 0.02 : 0);
            for (let i = 0; i < innerEdgeSeg; i++) {
                const angle = (i / innerEdgeSeg) * Math.PI * 2;
                innerEdgePos[i * 3] = Math.cos(angle) * innerR;
                innerEdgePos[i * 3 + 1] = Math.sin(angle) * innerR;
                innerEdgePos[i * 3 + 2] = -0.01;
            }
            innerEdgeGeo.attributes.position.needsUpdate = true;

            rippleMeshes.forEach((mesh, k) => {
                const phase = t * (0.35 + k * 0.12) + k * 0.8;
                const pulse = 0.55 + Math.sin(phase) * 0.45;
                mesh.scale.setScalar(
                    1 + Math.sin(phase * 1.3) * (st === 'SPEAKING' ? 0.04 + amp * 0.06 : 0.018),
                );
                const rm = rippleMats[k];
                if (st === 'ALERT') {
                    rm.color.setHex(0xe84848);
                    rm.opacity = (0.06 + (1 - k / RIPPLE_COUNT) * 0.07) * pulse * 1.15;
                }
                else {
                    rm.color.setHex(0x00b4c5);
                    rm.opacity =
                        (0.035 + (1 - k / RIPPLE_COUNT) * 0.06)
                        * pulse
                        * (st === 'SPEAKING' ? 1.25 : 1);
                }
            });

            const corePulse = 1 + (st === 'SPEAKING' ? Math.sin(t * 10) * 0.08 : Math.sin(t * 2.2) * 0.04);
            coreWire.scale.setScalar(corePulse);
            coreMat.opacity = st === 'SPEAKING' ? 0.62 + Math.sin(t * 8) * 0.18 : st === 'ALERT' ? 0.5 : 0.48;
            nucleusMat.opacity = st === 'SPEAKING' ? 0.42 + Math.sin(t * 7) * 0.2 : 0.32;

            if (st === 'ALERT') {
                lineMaterial.color.setHex(0xff4444);
                lineMaterial.opacity = 0.28 + Math.sin(t * 5) * 0.14;
                innerEdgeMat.color.setHex(0xff6b6b);
                innerEdgeMat.opacity = 0.32 + Math.sin(t * 4.5) * 0.12;
                glowMat.color.setHex(0x5c1010);
                glowMat.opacity = 0.12 + Math.sin(t * 4) * 0.06;
                coreMat.color.setHex(0xff9999);
                nucleusMat.color.setHex(0xffcccc);
                tickMat.color.setHex(0xff8888);
            }
            else {
                lineMaterial.color.setHex(0x40e0d0);
                lineMaterial.opacity =
                    st === 'SPEAKING' ? 0.26 + Math.sin(t * 7) * 0.14 : 0.18 + Math.sin(t * 1.05) * 0.08;
                innerEdgeMat.color.setHex(0x7fffd4);
                innerEdgeMat.opacity = 0.28 + Math.sin(t * 1.4) * 0.08;
                glowMat.color.setHex(0x0d4f52);
                glowMat.opacity = st === 'SPEAKING' ? 0.1 + Math.sin(t * 5) * 0.05 : 0.075 + Math.sin(t * 1.2) * 0.035;
                coreMat.color.setHex(0x7fffd4);
                nucleusMat.color.setHex(0x00fff2);
                tickMat.color.setHex(0x7fffd4);
            }

            renderer.render(scene, camera);
        };

        animate();

        return () => {
            window.cancelAnimationFrame(frameRef.current);
            geometry.dispose();
            material.dispose();
            lineGeometry.dispose();
            lineMaterial.dispose();
            innerEdgeGeo.dispose();
            innerEdgeMat.dispose();
            rippleMeshes.forEach((m, i) => {
                m.geometry.dispose();
                rippleMats[i].dispose();
            });
            coreGeo.dispose();
            coreMat.dispose();
            nucleusGeo.dispose();
            nucleusMat.dispose();
            glowGeo.dispose();
            glowMat.dispose();
            tickGeo.dispose();
            tickMat.dispose();
            renderer.dispose();
        };
    }, []);

    return (
        <canvas
            ref={ canvasRef }
            width={ RING_SIZE }
            height={ RING_SIZE }
            className="agent-ring-canvas block"
            style={ { display: 'block', width: RING_SIZE, height: RING_SIZE } }
        />
    );
}
