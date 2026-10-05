import * as THREE from 'three';

// Procedural 3D burger with ember particles. Layers "explode" apart as the page scrolls.
export function initBurgerScene(canvas) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 2.2, 9);

  // Lights
  scene.add(new THREE.HemisphereLight(0xffe7c2, 0x2a1206, 0.9));
  const key = new THREE.DirectionalLight(0xfff1dd, 2.4);
  key.position.set(4, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4; key.shadow.camera.right = 4;
  key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
  scene.add(key);
  const rim = new THREE.PointLight(0xff6a00, 40, 20);
  rim.position.set(-4, 2, -3);
  scene.add(rim);
  const fill = new THREE.PointLight(0xffc06b, 15, 20);
  fill.position.set(3, -1, 4);
  scene.add(fill);

  const burger = new THREE.Group();
  scene.add(burger);

  const std = (color, roughness = 0.6, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });

  const layers = [];
  const addLayer = (mesh, y) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = y;
    mesh.userData.baseY = y;
    burger.add(mesh);
    layers.push(mesh);
    return mesh;
  };

  // Bottom bun
  const bottomPts = [];
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * Math.PI;
    bottomPts.push(new THREE.Vector2(1.48 + Math.sin(t) * 0.12, 0.45 * (i / 12)));
  }
  bottomPts.unshift(new THREE.Vector2(0, 0));
  bottomPts.push(new THREE.Vector2(0, 0.45));
  const bunMat = std(0xd98a3a, 0.55, { emissive: 0x2a1000, emissiveIntensity: 0.2 });
  addLayer(new THREE.Mesh(new THREE.LatheGeometry(bottomPts, 64), bunMat), 0);

  // Lettuce: wavy disc
  const lettuceGeo = new THREE.CircleGeometry(1.85, 160, 0, Math.PI * 2);
  lettuceGeo.rotateX(-Math.PI / 2);
  {
    const p = lettuceGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const r = Math.hypot(x, z);
      const a = Math.atan2(z, x);
      const k = r / 1.85;
      const scale = 1 + Math.sin(a * 9) * 0.04 * k;
      p.setXYZ(i, x * scale, Math.sin(a * 14) * 0.09 * k * k - k * 0.05, z * scale);
    }
    lettuceGeo.computeVertexNormals();
  }
  addLayer(new THREE.Mesh(lettuceGeo, std(0x6cc832, 0.5, { side: THREE.DoubleSide })), 0.5);

  // Patty with bumpy surface
  const pattyGeo = new THREE.CylinderGeometry(1.62, 1.66, 0.42, 72, 6);
  {
    const p = pattyGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + (Math.sin(x * 9 + z * 5) * Math.cos(z * 8 - y * 6)) * 0.02;
      p.setXYZ(i, x * n, y + (Math.abs(y) > 0.2 ? Math.sin(x * 11) * Math.cos(z * 13) * 0.025 : 0), z * n);
    }
    pattyGeo.computeVertexNormals();
  }
  addLayer(new THREE.Mesh(pattyGeo, std(0x4a230f, 0.95)), 0.78);

  // Cheese with drooping corners
  const cheeseGeo = new THREE.BoxGeometry(2.9, 0.06, 2.9, 30, 1, 30);
  {
    const p = cheeseGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const d = Math.hypot(x, z);
      if (d > 1.5) p.setY(i, p.getY(i) - (d - 1.5) ** 2 * 0.55);
    }
    cheeseGeo.computeVertexNormals();
  }
  const cheese = addLayer(new THREE.Mesh(cheeseGeo, std(0xffb511, 0.35, { emissive: 0x552800, emissiveIntensity: 0.25 })), 1.02);
  cheese.rotation.y = Math.PI / 4;

  // Tomato slices
  const tomatoGroup = new THREE.Group();
  const tomatoMat = std(0xe0301e, 0.3, { emissive: 0x3a0500, emissiveIntensity: 0.3 });
  [[-0.62, 0.15], [0.62, -0.15], [0, 0.75], [0.05, -0.8]].forEach(([x, z]) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.12, 40), tomatoMat);
    t.position.set(x, 0, z);
    t.castShadow = true;
    tomatoGroup.add(t);
  });
  addLayer(tomatoGroup, 1.14);

  // Onion rings
  const onionGroup = new THREE.Group();
  const onionMat = std(0xf3e6f0, 0.4, { transparent: true, opacity: 0.92 });
  [[0.4, 0.3, 0.55], [-0.5, -0.3, 0.45], [0.2, -0.6, 0.35]].forEach(([x, z, r]) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 12, 40), onionMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0, z);
    onionGroup.add(ring);
  });
  addLayer(onionGroup, 1.24);

  // Top bun dome
  const topPts = [new THREE.Vector2(0, 0), new THREE.Vector2(1.5, 0), new THREE.Vector2(1.6, 0.06)];
  for (let i = 1; i <= 24; i++) {
    const t = (i / 24) * (Math.PI / 2);
    topPts.push(new THREE.Vector2(Math.cos(t) * 1.62, 0.06 + Math.sin(t) * 1.15));
  }
  const topBun = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.LatheGeometry(topPts, 72), bunMat);
  dome.castShadow = true;
  topBun.add(dome);

  // Sesame seeds
  const seedGeo = new THREE.SphereGeometry(1, 10, 6);
  const seedMat = std(0xfff2cf, 0.4);
  const seeds = new THREE.InstancedMesh(seedGeo, seedMat, 70);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(0.07, 0.025, 0.04);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 70; i++) {
    const t = 0.35 + Math.random() * 1.15; // elevation angle on dome
    const a = Math.random() * Math.PI * 2;
    const r = Math.cos(t) * 1.62, y = 0.06 + Math.sin(t) * 1.15;
    const pos = new THREE.Vector3(Math.cos(a) * r, y + 0.01, Math.sin(a) * r);
    const normal = new THREE.Vector3(Math.cos(a) * Math.cos(t) / 1.62, Math.sin(t) / 1.15, Math.sin(a) * Math.cos(t) / 1.62).normalize();
    q.setFromUnitVectors(up, normal);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(up, Math.random() * Math.PI));
    m.compose(pos, q, s);
    seeds.setMatrixAt(i, m);
  }
  topBun.add(seeds);
  addLayer(topBun, 1.32);

  burger.position.y = -1.2;

  // Soft contact shadow
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.35 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.25;
  const groundBaseY = ground.position.y;
  ground.receiveShadow = true;
  scene.add(ground);

  // Ember particles
  const EMBERS = 260;
  const ePos = new Float32Array(EMBERS * 3);
  const eSpeed = new Float32Array(EMBERS);
  for (let i = 0; i < EMBERS; i++) {
    ePos[i * 3] = (Math.random() - 0.5) * 12;
    ePos[i * 3 + 1] = Math.random() * 10 - 4;
    ePos[i * 3 + 2] = (Math.random() - 0.5) * 8 - 1;
    eSpeed[i] = 0.3 + Math.random() * 0.9;
  }
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  const sprite = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,240,200,1)');
    grd.addColorStop(0.3, 'rgba(255,140,30,0.9)');
    grd.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({
    size: 0.16, map: sprite, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, color: 0xffa040,
  }));
  scene.add(embers);

  // Interaction state
  const pointer = { x: 0, y: 0 };
  let scrollProgress = 0;
  let spinVelocity = 0;
  let dragging = false, lastX = 0;

  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    if (dragging) {
      spinVelocity += (e.clientX - lastX) * 0.0025;
      lastX = e.clientX;
    }
  }, { passive: true });
  const hero = document.querySelector('.hero');
  hero.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; });
  window.addEventListener('pointerup', () => { dragging = false; });

  const onScroll = () => {
    scrollProgress = Math.min(1, window.scrollY / (window.innerHeight * 0.9));
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  let lift = 0; // raises the burger above the hero text on portrait screens
  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Pull camera back on narrow (portrait) screens so the burger fits
    const portrait = w / h < 0.8;
    camera.position.z = portrait ? 14 : 9;
    lift = portrait ? 1.9 : 0;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  let smoothProgress = 0;
  let visible = true;
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; });

  function tick() {
    requestAnimationFrame(tick);
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    smoothProgress += (scrollProgress - smoothProgress) * 0.08;

    // Explode layers
    layers.forEach((layer, i) => {
      const target = layer.userData.baseY + i * smoothProgress * 0.75;
      layer.position.y += (target - layer.position.y) * 0.15;
      if (layer !== cheese) layer.rotation.y = smoothProgress * (i % 2 ? 0.6 : -0.6);
    });

    spinVelocity *= 0.94;
    burger.rotation.y += (reduceMotion ? 0.001 : 0.004) + spinVelocity;
    burger.rotation.x += ((pointer.y * 0.25 + 0.15 + smoothProgress * 0.25) - burger.rotation.x) * 0.05;
    burger.rotation.z += ((-pointer.x * 0.12) - burger.rotation.z) * 0.05;
    burger.position.y = -1.2 + lift + (reduceMotion ? 0 : Math.sin(t * 1.4) * 0.12) + smoothProgress * 0.4;

    camera.position.x += (pointer.x * 0.6 - camera.position.x) * 0.04;
    camera.lookAt(0, 0.2 + smoothProgress * 1.2, 0);

    rim.intensity = 40 + Math.sin(t * 7) * 6 + Math.sin(t * 13) * 4; // flickering fire

    const pa = eGeo.attributes.position;
    for (let i = 0; i < EMBERS; i++) {
      let y = pa.getY(i) + eSpeed[i] * dt;
      if (y > 6) y = -4;
      pa.setY(i, y);
      pa.setX(i, pa.getX(i) + Math.sin(t * 2 + i) * 0.003);
    }
    pa.needsUpdate = true;

    ground.position.y = groundBaseY + lift;
    canvas.style.opacity = String(1 - smoothProgress * 0.75);
    renderer.render(scene, camera);
  }
  tick();
}
