import * as THREE from 'three';

function scaleTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#1fd1b5');
  grad.addColorStop(0.5, '#2a7fd6');
  grad.addColorStop(1, '#6b3fd1');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);

  // Overlapping dragon scales
  const r = 26;
  for (let row = 0, y = -r; y < c.height + r; row++, y += r * 0.9) {
    for (let x = (row % 2) * r - r; x < c.width + r; x += r * 2) {
      const sg = g.createRadialGradient(x, y + r * 0.2, 2, x, y, r);
      sg.addColorStop(0, 'rgba(255,255,255,0.18)');
      sg.addColorStop(0.75, 'rgba(255,255,255,0.03)');
      sg.addColorStop(1, 'rgba(10,20,60,0.35)');
      g.fillStyle = sg;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI);
      g.fill();
      g.strokeStyle = 'rgba(255,230,170,0.25)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, r - 1, 0.1, Math.PI - 0.1);
      g.stroke();
    }
  }
  // Golden speckles
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(255, ${190 + Math.random() * 50}, 90, ${0.35 + Math.random() * 0.5})`;
    g.beginPath();
    g.arc(Math.random() * c.width, Math.random() * c.height, 2 + Math.random() * 7, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function crackTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#ffb347';
  g.lineCap = 'round';
  g.shadowColor = '#ff7a2f';
  g.shadowBlur = 12;
  // A zig-zag crack around the upper third, plus a few branches
  for (let pass = 0; pass < 2; pass++) {
    g.lineWidth = pass ? 2 : 5;
    g.beginPath();
    g.moveTo(0, 150);
    for (let x = 0; x <= c.width; x += 32) {
      const y = (x / 32) % 2 ? 176 : 132;
      g.lineTo(x, y + Math.sin(x * 0.05) * 6);
    }
    g.stroke();
  }
  for (const [x0, y0] of [[200, 160], [520, 135], [810, 170]]) {
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x0 + 18, y0 + 34);
    g.lineTo(x0 + 6, y0 + 62);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function emberSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.3, 'rgba(255,160,60,0.8)');
  grad.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function mountEgg(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0.15, 7.2);

  // Egg silhouette: wider at the bottom
  const pts = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    const y = -1 + 2 * t;
    const r = Math.sqrt(Math.max(0, 1 - y * y)) * (1 - 0.16 * y) * 0.92;
    pts.push(new THREE.Vector2(r, y * 1.25));
  }
  const geo = new THREE.LatheGeometry(pts, 128);
  const crack = crackTexture();
  const mat = new THREE.MeshPhysicalMaterial({
    map: scaleTexture(),
    roughness: 0.32,
    metalness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.18,
    iridescence: 0.7,
    iridescenceIOR: 1.4,
    sheen: 0.6,
    sheenColor: new THREE.Color('#ffc65a'),
    emissive: new THREE.Color('#ff8a3d'),
    emissiveMap: crack,
    emissiveIntensity: 1.2,
  });
  const egg = new THREE.Mesh(geo, mat);
  const pivot = new THREE.Group();
  pivot.add(egg);
  scene.add(pivot);

  scene.add(new THREE.AmbientLight('#8fb3ff', 0.55));
  const key = new THREE.DirectionalLight('#ffe2b8', 2.4);
  key.position.set(-3, 4, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight('#3be3c8', 1.3);
  fill.position.set(4, -1, 3);
  scene.add(fill);
  const rim = new THREE.PointLight('#ff7a2f', 30, 12);
  rim.position.set(0, 1.5, -3);
  scene.add(rim);

  // Rising embers
  const COUNT = 140;
  const pos = new Float32Array(COUNT * 3);
  const speed = new Float32Array(COUNT);
  const reset = (i, randomY) => {
    const a = Math.random() * Math.PI * 2;
    const rad = 1.1 + Math.random() * 1.6;
    pos[i * 3] = Math.cos(a) * rad;
    pos[i * 3 + 1] = randomY ? -2.2 + Math.random() * 4.4 : -2.2;
    pos[i * 3 + 2] = Math.sin(a) * rad * 0.6;
    speed[i] = 0.004 + Math.random() * 0.01;
  };
  for (let i = 0; i < COUNT; i++) reset(i, true);
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const embers = new THREE.Points(
    pgeo,
    new THREE.PointsMaterial({ size: 0.09, map: emberSprite(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  scene.add(embers);

  const pointer = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  });

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let visible = true;
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
  }).observe(canvas);

  const clock = new THREE.Clock();
  const frame = () => {
    const t = clock.getElapsedTime();
    egg.rotation.y = t * 0.35;
    // Every few seconds the egg wiggles as if something inside is about to hatch.
    const phase = t % 5.5;
    const wiggle = phase < 0.7 ? Math.sin(phase * 38) * 0.07 * (1 - phase / 0.7) : 0;
    pivot.rotation.z = Math.sin(t * 1.3) * 0.05 + wiggle + pointer.x * -0.12;
    pivot.rotation.x = pointer.y * 0.1;
    pivot.position.y = Math.sin(t * 1.1) * 0.08;
    mat.emissiveIntensity = 0.9 + Math.sin(t * 2.2) * 0.5 + (wiggle ? 0.8 : 0);
    rim.intensity = 26 + Math.sin(t * 2.2) * 8;

    for (let i = 0; i < COUNT; i++) {
      pos[i * 3 + 1] += speed[i];
      pos[i * 3] += Math.sin(t + i) * 0.0015;
      if (pos[i * 3 + 1] > 2.4) reset(i, false);
    }
    pgeo.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
  };

  if (reduced) {
    frame();
    return;
  }
  renderer.setAnimationLoop(() => {
    if (visible && !document.hidden) frame();
  });
}
