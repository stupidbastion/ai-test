import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const overlay = document.getElementById("startOverlay");
const startBtn = document.getElementById("startBtn");
const hud = document.getElementById("hud");
const objective = document.getElementById("objective");
const statusLine = document.getElementById("statusLine");
const thought = document.getElementById("thought");
const settingsPanel = document.getElementById("settingsPanel");
const fovSlider = document.getElementById("fovSlider");
const fovValue = document.getElementById("fovValue");
const qualitySelect = document.getElementById("qualitySelect");
const forwardKeySelect = document.getElementById("forwardKey");
const sprintKeySelect = document.getElementById("sprintKey");
const flashlightKeySelect = document.getElementById("flashlightKey");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.FogExp2(0x05060a, 0.045);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 1.7, 14);

const clock = new THREE.Clock();
const keys = new Set();
let pointerLocked = false;
let started = false;
let paused = false;

const state = {
  stamina: 100,
  sprinting: false,
  flashlightOn: true,
  quality: "high",
  collected: 0,
  grounded: true,
  velocityY: 0,
  cameraBobTime: 0,
  controls: {
    forward: "KeyW",
    sprint: "ShiftLeft",
    flashlight: "KeyF"
  }
};

const colliders = [];
const sigils = [];
const roomZones = [
  { min: new THREE.Vector3(-16, 0, 6), max: new THREE.Vector3(-6, 4, 14), text: "Doesn't look like anything good happened here..." },
  { min: new THREE.Vector3(6, 0, 5), max: new THREE.Vector3(16, 4, 14), text: "The wallpaper is peeling like skin. I should not stay long." },
  { min: new THREE.Vector3(-14, 0, -14), max: new THREE.Vector3(-4, 4, -4), text: "I swear I heard my sister whisper from behind that mirror." },
  { min: new THREE.Vector3(5, 0, -14), max: new THREE.Vector3(15, 4, -4), text: "Someone barricaded this room from the inside... and still didn't make it." }
];

const playerBox = new THREE.Box3();
let activeRoomText = "";

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let masterGain = audioCtx.createGain();
masterGain.gain.value = 0.35;
masterGain.connect(audioCtx.destination);

function noiseAmbience() {
  const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * 0.2;
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = audioCtx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 230;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.12;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  source.start();
}

function tone(freq, duration, vol = 0.06, type = "sine") {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = vol;
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.stop(audioCtx.currentTime + duration);
}

function showThought(text) {
  thought.textContent = text;
  thought.classList.remove("hidden");
  setTimeout(() => {
    if (text === activeRoomText) thought.classList.add("hidden");
  }, 3000);
}

function addCollider(mesh) {
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  colliders.push(box);
}

function wall(x, z, w, h, d) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: 0x3f3d44, roughness: 0.95, metalness: 0.05 })
  );
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  addCollider(mesh);
}

function makeFurniture() {
  const wood = new THREE.MeshStandardMaterial({ color: 0x412a1f, roughness: 0.84 });

  function table(x, z) {
    const group = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 1.4), wood);
    top.position.y = 1;
    group.add(top);
    for (const lx of [-1, 1]) {
      for (const lz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1, 0.15), wood);
        leg.position.set(lx * 1.05, 0.5, lz * 0.55);
        group.add(leg);
      }
    }
    group.position.set(x, 0, z);
    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(group);
    addCollider(group);
  }

  function wardrobe(x, z) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.8, 0.7), wood);
    body.position.set(x, 1.4, z);
    body.castShadow = true;
    body.receiveShadow = true;
    scene.add(body);
    addCollider(body);
  }

  table(-10, 10);
  table(10, 10);
  table(-9, -9);
  wardrobe(12.5, -8);
  wardrobe(-12.5, -8);
}

function buildMansion() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x121315, roughness: 0.88 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 4;
  scene.add(ceiling);

  wall(0, 20, 40, 4, 1); wall(0, -20, 40, 4, 1); wall(20, 0, 1, 4, 40); wall(-20, 0, 1, 4, 40);
  wall(0, 4, 1, 4, 32); wall(0, -4, 1, 4, 32);
  wall(-10, 0, 20, 4, 1); wall(10, 0, 20, 4, 1);

  const openPaths = [
    new THREE.Box3(new THREE.Vector3(-2.2, 0, 8), new THREE.Vector3(2.2, 4, 12)),
    new THREE.Box3(new THREE.Vector3(-2.2, 0, -12), new THREE.Vector3(2.2, 4, -8)),
    new THREE.Box3(new THREE.Vector3(-12, 0, -2.2), new THREE.Vector3(-8, 4, 2.2)),
    new THREE.Box3(new THREE.Vector3(8, 0, -2.2), new THREE.Vector3(12, 4, 2.2))
  ];
  colliders.splice(0, colliders.length, ...colliders.filter((box) => !openPaths.some((door) => door.intersectsBox(box))));

  makeFurniture();

  const sigilMaterial = new THREE.MeshStandardMaterial({ emissive: 0x7c2cff, emissiveIntensity: 1.8, color: 0x2d1948, roughness: 0.2 });
  const sigilPositions = [
    new THREE.Vector3(-11, 1.2, 10),
    new THREE.Vector3(10, 1.2, 10),
    new THREE.Vector3(-10, 1.2, -10),
    new THREE.Vector3(11, 1.2, -10)
  ];
  for (const pos of sigilPositions) {
    const sigil = new THREE.Mesh(new THREE.TorusKnotGeometry(0.32, 0.09, 64, 10), sigilMaterial.clone());
    sigil.position.copy(pos);
    sigil.castShadow = true;
    scene.add(sigil);
    sigils.push(sigil);
  }
}

function addLighting() {
  const moon = new THREE.DirectionalLight(0x96a5d1, 0.45);
  moon.position.set(8, 14, 8);
  moon.castShadow = true;
  moon.shadow.mapSize.width = 2048;
  moon.shadow.mapSize.height = 2048;
  scene.add(moon);

  const hemi = new THREE.HemisphereLight(0x536080, 0x16120f, 0.28);
  scene.add(hemi);

  const chandeliers = [new THREE.Vector3(0, 3.2, 8.5), new THREE.Vector3(0, 3.2, -8.5)];
  chandeliers.forEach((pos, i) => {
    const bulb = new THREE.PointLight(0xffddb1, 1.1, 16, 2.0);
    bulb.position.copy(pos);
    bulb.castShadow = true;
    scene.add(bulb);

    const cage = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), new THREE.MeshStandardMaterial({ emissive: 0xffcc85, emissiveIntensity: 0.8, color: 0x2c2116 }));
    cage.position.copy(pos);
    scene.add(cage);

    if (i === 1) setInterval(() => { bulb.intensity = 0.7 + Math.random() * 0.8; }, 300);
  });
}

const flashlight = new THREE.SpotLight(0xe3f0ff, 1.8, 22, Math.PI / 7, 0.45, 1.1);
flashlight.castShadow = true;
scene.add(flashlight);
scene.add(flashlight.target);

function applyQuality(mode) {
  state.quality = mode;
  if (mode === "low") {
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = false;
    scene.fog.density = 0.06;
  } else if (mode === "medium") {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.shadowMap.enabled = true;
    scene.fog.density = 0.05;
    flashlight.shadow.mapSize.set(512, 512);
  } else {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    scene.fog.density = 0.042;
    flashlight.shadow.mapSize.set(1024, 1024);
  }
}

function setupInput() {
  document.addEventListener("keydown", (e) => {
    keys.add(e.code);

    if (e.code === "KeyP" && started) {
      paused = !paused;
      settingsPanel.classList.toggle("hidden", !paused);
      if (paused) document.exitPointerLock();
      else renderer.domElement.requestPointerLock();
    }

    if (e.code === state.controls.flashlight) {
      state.flashlightOn = !state.flashlightOn;
    }

    if (e.code === "Space" && state.grounded && !paused) {
      state.velocityY = 5.6;
      state.grounded = false;
      tone(130, 0.06, 0.04, "triangle");
    }
  });

  document.addEventListener("keyup", (e) => keys.delete(e.code));

  renderer.domElement.addEventListener("click", () => {
    if (started && !paused) renderer.domElement.requestPointerLock();
  });

  document.addEventListener("pointerlockchange", () => {
    pointerLocked = document.pointerLockElement === renderer.domElement;
  });

  document.addEventListener("mousemove", (e) => {
    if (!pointerLocked || paused) return;
    camera.rotation.order = "YXZ";
    camera.rotation.y -= e.movementX * 0.0023;
    camera.rotation.x -= e.movementY * 0.0019;
    camera.rotation.x = Math.max(-1.2, Math.min(1.2, camera.rotation.x));
  });
}

function movePlayer(dt) {
  const move = new THREE.Vector3();
  const forward = new THREE.Vector3(Math.sin(camera.rotation.y), 0, Math.cos(camera.rotation.y)).normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x);

  if (keys.has(state.controls.forward)) move.add(forward);
  if (keys.has("KeyS")) move.sub(forward);
  if (keys.has("KeyA")) move.sub(right);
  if (keys.has("KeyD")) move.add(right);

  const sprintPressed = keys.has(state.controls.sprint) && move.lengthSq() > 0.01 && state.stamina > 5;
  state.sprinting = sprintPressed;
  const speed = sprintPressed ? 6.0 : 3.5;

  if (sprintPressed) state.stamina = Math.max(0, state.stamina - 28 * dt);
  else state.stamina = Math.min(100, state.stamina + 18 * dt);

  if (move.lengthSq() > 0.001) {
    move.normalize().multiplyScalar(speed * dt);
    const prev = camera.position.clone();
    camera.position.add(move);

    playerBox.min.set(camera.position.x - 0.28, camera.position.y - 1.7, camera.position.z - 0.28);
    playerBox.max.set(camera.position.x + 0.28, camera.position.y + 0.2, camera.position.z + 0.28);
    if (colliders.some((c) => c.intersectsBox(playerBox))) camera.position.copy(prev);

    state.cameraBobTime += dt * (sprintPressed ? 13 : 8.5);
    const bob = Math.sin(state.cameraBobTime) * 0.045;
    camera.position.y = 1.7 + bob + (state.grounded ? 0 : 0);

    if (Math.sin(state.cameraBobTime) > 0.97) tone(95 + Math.random() * 25, 0.06, sprintPressed ? 0.034 : 0.02, "triangle");
  }

  state.velocityY -= 13.5 * dt;
  camera.position.y += state.velocityY * dt;
  if (camera.position.y <= 1.7) {
    camera.position.y = 1.7;
    state.velocityY = 0;
    state.grounded = true;
  }

  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -18.5, 18.5);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -18.5, 18.5);
}

function updateSigils(dt) {
  for (const sigil of sigils) {
    if (!sigil.visible) continue;
    sigil.rotation.x += dt * 0.45;
    sigil.rotation.y += dt * 1.3;
    const d = sigil.position.distanceTo(camera.position);
    if (d < 1.45) {
      sigil.visible = false;
      state.collected += 1;
      tone(460, 0.25, 0.06, "sine");
      setTimeout(() => tone(680, 0.16, 0.05, "triangle"), 90);
    }
  }
}

function updateNarration() {
  for (const zone of roomZones) {
    if (camera.position.x > zone.min.x && camera.position.x < zone.max.x && camera.position.z > zone.min.z && camera.position.z < zone.max.z) {
      if (activeRoomText !== zone.text) {
        activeRoomText = zone.text;
        showThought(zone.text);
      }
      return;
    }
  }
}

function updateObjective() {
  const escaped = state.collected === 4 && camera.position.z > 18 && Math.abs(camera.position.x) < 2;
  objective.textContent = escaped
    ? "You escaped Blackthorn Manor with the truth."
    : `Objective: Recover all memory sigils (${state.collected}/4) and reach the front gate.`;
  statusLine.textContent = `Stamina: ${Math.round(state.stamina)}% · Flashlight: ${state.flashlightOn ? "ON" : "OFF"} · Graphics: ${state.quality.toUpperCase()}`;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);

  if (started && !paused) {
    movePlayer(dt);
    updateSigils(dt);
    updateNarration();
  }

  flashlight.visible = state.flashlightOn;
  flashlight.position.copy(camera.position);
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
  flashlight.target.position.copy(camera.position).add(dir.multiplyScalar(4));
  flashlight.target.updateMatrixWorld();

  updateObjective();
  renderer.render(scene, camera);
}

startBtn.addEventListener("click", async () => {
  overlay.classList.add("hidden");
  hud.classList.remove("hidden");
  started = true;
  await audioCtx.resume();
  noiseAmbience();
  renderer.domElement.requestPointerLock();
});

fovSlider.addEventListener("input", () => {
  const v = Number(fovSlider.value);
  fovValue.textContent = String(v);
  camera.fov = v;
  camera.updateProjectionMatrix();
});

qualitySelect.addEventListener("change", () => applyQuality(qualitySelect.value));
forwardKeySelect.addEventListener("change", () => { state.controls.forward = forwardKeySelect.value; });
sprintKeySelect.addEventListener("change", () => { state.controls.sprint = sprintKeySelect.value; });
flashlightKeySelect.addEventListener("change", () => { state.controls.flashlight = flashlightKeySelect.value; });

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  applyQuality(state.quality);
});

buildMansion();
addLighting();
applyQuality("high");
setupInput();
animate();
