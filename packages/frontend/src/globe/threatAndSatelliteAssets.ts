import * as THREE from 'three';

type AnimateFn = (t: number) => void;

function setThreatAnimate(group: THREE.Group, fn: AnimateFn): void {
    (group.userData as { threatAnimate?: AnimateFn }).threatAnimate = fn;
}

/** Gold / silver commsat with blue panels — reference layout (scaled in update). */
export function buildSatelliteAsset(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'satellite-asset';

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 1.4, 1.4),
        new THREE.MeshBasicMaterial({ color: 0xc9a84c })
    );
    group.add(body);

    const cylinder = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 1.2, 16),
        new THREE.MeshBasicMaterial({ color: 0xaaaaaa })
    );
    cylinder.rotation.z = Math.PI / 2;
    cylinder.position.set(1.5, 0, 0);
    group.add(cylinder);

    const panelL = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 0.06, 1.4),
        new THREE.MeshBasicMaterial({ color: 0x1a3a6c })
    );
    panelL.position.set(-3.2, 0.3, 0);
    panelL.rotation.z = 0.15;
    group.add(panelL);

    const panelR = panelL.clone();
    panelR.position.set(3.2, 0.3, 0);
    panelR.rotation.z = -0.15;
    group.add(panelR);

    (
        group as THREE.Group & {
            panelMaterials?: THREE.MeshBasicMaterial[];
        }
    ).panelMaterials = [
        panelL.material as THREE.MeshBasicMaterial,
        panelR.material as THREE.MeshBasicMaterial,
    ];

    const strutGeo = new THREE.BoxGeometry(0.1, 0.1, 1.4);
    const strutMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
    const strutL = new THREE.Mesh(strutGeo, strutMat);
    strutL.position.set(-1.6, 0.15, 0);
    group.add(strutL);
    const strutR = strutL.clone();
    strutR.position.set(1.6, 0.15, 0);
    group.add(strutR);

    const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshBasicMaterial({
            color: 0xeeeeee,
            side: THREE.DoubleSide,
        })
    );
    dish.position.set(0.4, 0, 1.2);
    dish.rotation.x = Math.PI / 2;
    group.add(dish);

    const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8),
        new THREE.MeshBasicMaterial({ color: 0x999999 })
    );
    arm.position.set(0.4, 0, 0.8);
    arm.rotation.x = Math.PI / 2;
    group.add(arm);

    for (let i = 0; i < 3; i++) {
        const spike = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6),
            new THREE.MeshBasicMaterial({ color: 0xcccccc })
        );
        spike.position.set(-0.4 + i * 0.4, 0.9, 0.2);
        group.add(spike);
    }

    const light = new THREE.PointLight(0xe84040, 0, 16, 1.6);
    light.position.set(0, 0.2, 0);
    group.add(light);

    (
        group as THREE.Group & {
            assetBody?: THREE.Mesh;
            assetLight?: THREE.PointLight;
        }
    ).assetBody = body;
    (group as THREE.Group & { assetLight?: THREE.PointLight }).assetLight = light;

    return group;
}

/**
 * Red triangle + glow + white “!” at cinematic threat POV.
 * Pulse scales an inner group so GlobeView can set the root scale (sun/earth layout).
 */
export function buildThreatAsset(): THREE.Group {
    const group = new THREE.Group();
    const inner = new THREE.Group();
    group.add(inner);

    const triangleShape = new THREE.Shape();
    triangleShape.moveTo(0, 6);
    triangleShape.lineTo(5.2, -3);
    triangleShape.lineTo(-5.2, -3);
    triangleShape.lineTo(0, 6);

    const triangleGeo = new THREE.ShapeGeometry(triangleShape);
    const triangleMat = new THREE.MeshBasicMaterial({
        color: 0xe84040,
        side: THREE.DoubleSide,
    });
    const triangle = new THREE.Mesh(triangleGeo, triangleMat);
    inner.add(triangle);

    const glowShape = new THREE.Shape();
    glowShape.moveTo(0, 8);
    glowShape.lineTo(6.9, -4);
    glowShape.lineTo(-6.9, -4);
    glowShape.lineTo(0, 8);

    const glowGeo = new THREE.ShapeGeometry(glowShape);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    inner.add(glow);

    const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 3.2, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    bar.position.set(0, 0.8, 0.1);
    inner.add(bar);

    const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.45, 12),
        new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
        })
    );
    dot.position.set(0, -1.6, 0.1);
    inner.add(dot);

    (group.userData as { billboard?: boolean }).billboard = true;

    setThreatAnimate(group, (t) => {
        const pulse = 1 + Math.sin(t * 3) * 0.08;
        inner.scale.setScalar(pulse);
        glowMat.opacity = 0.12 + Math.sin(t * 3) * 0.1;
    });

    return group;
}

/** Keys match `CinematicThreatVisual` / THREAT_LIB child `name`; factory is always `buildThreatAsset`. */
const THREAT_ASSET_LIBRARY_NAMES = [
    'SOLAR_STORM',
    'SOLAR_FLARE_XCLASS',
    'SOLAR_FLARE_MCLASS',
    'CME_STANDARD',
    'CME_HALO',
    'CME_CORONAGRAPH',
    'CME_COMPOSITE',
    'SOLAR_ENERGETIC_PARTICLE',
    'PROTON_FLUX',
    'GEOMAGNETIC_STORM_G3',
    'GEOMAGNETIC_STORM_G4',
    'GEOMAGNETIC_STORM_G5',
    'MAGNETOSPHERE_COMPRESSION',
    'ATMOSPHERIC_DRAG',
    'RADIATION_BELT',
    'CONJUNCTION',
    'EXTREME_CME',
] as const;

const THREAT_LIBRARY_SPECS: { name: string; factory: () => THREE.Group }[] =
    THREAT_ASSET_LIBRARY_NAMES.map((name) => ({
        name,
        factory: buildThreatAsset,
    }));

/** One child group per threat key; all `visible: false` until cinematic selects the key. */
export function buildThreatAssetLibrary(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'threat-asset-library';
    for (const { name, factory } of THREAT_LIBRARY_SPECS) {
        const g = factory();
        g.name = name;
        g.visible = false;
        root.add(g);
    }
    return root;
}

export function runThreatChildAnimate(ch: THREE.Object3D, t: number): void {
    const fn = (ch.userData as { threatAnimate?: AnimateFn }).threatAnimate;
    fn?.(t);
}

/** Image 8 — plasma shroud + darkened bus when asset is under attack */
export function ensureSatelliteAttackPlasma(satelliteGroup: THREE.Group): void {
    const u = satelliteGroup.userData as {
        attackFire?: THREE.Mesh[];
        attackInit?: boolean;
    };
    if (u.attackInit) return;
    u.attackInit = true;
    const fireParticles: THREE.Mesh[] = [];
    for (let i = 0; i < 40; i++) {
        const fire = new THREE.Mesh(
            new THREE.SphereGeometry(0.15 + Math.random() * 0.25, 6, 6),
            new THREE.MeshBasicMaterial({
                color: i % 3 === 0 ? 0xff2200 : i % 3 === 1 ? 0xff6600 : 0xff9900,
                transparent: true,
                opacity: 0.5 + Math.random() * 0.4,
                depthWrite: false,
            })
        );
        fire.userData.orbitRadius = 1.5 + Math.random() * 2.5;
        fire.userData.orbitSpeed = 0.8 + Math.random() * 1.8;
        fire.userData.orbitPhase = Math.random() * Math.PI * 2;
        fire.userData.orbitTilt = (Math.random() - 0.5) * Math.PI;
        satelliteGroup.add(fire);
        fireParticles.push(fire);
    }
    u.attackFire = fireParticles;

    satelliteGroup.traverse((child) => {
        if (child instanceof THREE.Mesh && child.geometry?.type === 'BoxGeometry') {
            const mat = child.material;
            if (mat instanceof THREE.MeshBasicMaterial) {
                mat.color.setHex(0x1a1a1a);
            }
        }
    });
}

export function animateSatelliteAttackPlasma(satelliteGroup: THREE.Group, t: number): void {
    const u = satelliteGroup.userData as { attackFire?: THREE.Mesh[] };
    u.attackFire?.forEach((p) => {
        const angle = t * (p.userData.orbitSpeed as number) + (p.userData.orbitPhase as number);
        const r = p.userData.orbitRadius as number;
        p.position.set(
            Math.cos(angle) * r,
            Math.sin(angle * 0.7) * r * 0.5,
            Math.sin(angle) * r * Math.cos(p.userData.orbitTilt as number)
        );
        if (p.material instanceof THREE.MeshBasicMaterial) {
            p.material.opacity = 0.3 + Math.sin(t * 4 + (p.userData.orbitPhase as number)) * 0.3;
        }
    });
}

export function clearSatelliteAttackPlasma(satelliteGroup: THREE.Group): void {
    const u = satelliteGroup.userData as { attackFire?: THREE.Mesh[]; attackInit?: boolean };
    u.attackFire?.forEach((m) => {
        satelliteGroup.remove(m);
        m.geometry.dispose();
        if (m.material instanceof THREE.Material) m.material.dispose();
    });
    u.attackFire = undefined;
    u.attackInit = false;
    satelliteGroup.traverse((child) => {
        if (child instanceof THREE.Mesh && child.geometry?.type === 'BoxGeometry') {
            const mat = child.material;
            if (mat instanceof THREE.MeshBasicMaterial) {
                mat.color.setHex(0xc9a84c);
            }
        }
    });
}
