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
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const hud = document.getElementById("hud");
const startButton = document.getElementById("startButton");
const objectiveEl = document.getElementById("objective");
const statusEl = document.getElementById("status");
const staminaEl = document.getElementById("stamina");
const messageEl = document.getElementById("message");

const worldMap = [
  "11111111111111111111",
  "10000000000000000001",
  "10111101111111111001",
  "10100100000100001001",
  "10100101110101101001",
  "10000101000101001001",
  "11110101011101001001",
  "10000101010001000001",
  "10111101010111111101",
  "10100001010100000001",
  "10101111010101111101",
  "10101000010100000101",
  "10101011110111110101",
  "10101010000100010101",
  "10101010111101010101",
  "100000100000010000E1",
  "11111111111111111111"
].map((row) => row.split(""));

const TILE = 1;
const FOV = Math.PI / 3;
const MAX_VIEW_DISTANCE = 22;
const MOVE_SPEED = 2.4;
const SPRINT_MULTIPLIER = 1.65;
const ROTATION_SPEED = 0.0028;
const RAY_COUNT_BASE = 280;

const player = {
  x: 1.7,
  y: 1.7,
  angle: Math.PI / 4,
  stamina: 100,
  flashlightOn: true,
  relics: 0,
  alive: true,
  won: false
};

const monster = {
  x: 14.5,
  y: 12.5,
  speed: 1.1,
  moveTimer: 0
};

const relics = [
  { x: 3.5, y: 5.5, collected: false },
  { x: 8.5, y: 3.5, collected: false },
  { x: 14.5, y: 7.5, collected: false },
  { x: 11.5, y: 14.5, collected: false }
];

const keys = new Set();
let muted = false;
let gameStarted = false;
let gameLoopId = null;
let lastTime = 0;
let noisePulse = 0;
let heartbeatCooldown = 0;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function isWall(x, y) {
  const gridX = Math.floor(x / TILE);
  const gridY = Math.floor(y / TILE);
  const row = worldMap[gridY];
  if (!row) return true;
  const cell = row[gridX];
  return cell === undefined || cell === "1";
}

function isExit(x, y) {
  const gridX = Math.floor(x / TILE);
  const gridY = Math.floor(y / TILE);
  const row = worldMap[gridY];
  return row && row[gridX] === "E";
}

function castRay(angle) {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);

  let distance = 0;
  while (distance < MAX_VIEW_DISTANCE) {
    distance += 0.02;
    const rx = player.x + cos * distance;
    const ry = player.y + sin * distance;

    if (isWall(rx, ry)) {
      const hitX = rx - Math.floor(rx);
      const hitY = ry - Math.floor(ry);
      const edge = Math.min(hitX, 1 - hitX, hitY, 1 - hitY);
      return { distance, edge };
    }
  }

  return { distance: MAX_VIEW_DISTANCE, edge: 0.5 };
}

function drawBackground() {
  const { width, height } = canvas;
  const gradSky = ctx.createLinearGradient(0, 0, 0, height / 2);
  gradSky.addColorStop(0, "#0d1019");
  gradSky.addColorStop(1, "#161a24");
  ctx.fillStyle = gradSky;
  ctx.fillRect(0, 0, width, height / 2);

  const gradGround = ctx.createLinearGradient(0, height / 2, 0, height);
  gradGround.addColorStop(0, "#11110f");
  gradGround.addColorStop(1, "#040404");
  ctx.fillStyle = gradGround;
  ctx.fillRect(0, height / 2, width, height / 2);
}

function drawWorld() {
  const rays = Math.floor((canvas.width / 1280) * RAY_COUNT_BASE) || RAY_COUNT_BASE;
  const columnWidth = canvas.width / rays;

  for (let i = 0; i < rays; i += 1) {
    const cameraX = i / rays;
    const rayAngle = player.angle - FOV / 2 + cameraX * FOV;
    const hit = castRay(rayAngle);

    const correctedDistance = hit.distance * Math.cos(rayAngle - player.angle);
    const wallHeight = Math.min(canvas.height, (canvas.height * 0.85) / (correctedDistance + 0.01));

    const brightnessBase = player.flashlightOn ? 1.35 : 0.5;
    const distanceShade = Math.max(0.08, brightnessBase - correctedDistance / 11);
    const edgeHighlight = Math.max(0.72, 1 - hit.edge * 0.8);

    const fog = Math.max(0, correctedDistance / 18);
    const colorValue = Math.floor(130 * distanceShade * edgeHighlight);
    const blueTint = Math.floor(155 * distanceShade);

    ctx.fillStyle = `rgba(${colorValue}, ${colorValue * 0.88}, ${blueTint}, ${1 - fog * 0.75})`;
    ctx.fillRect(i * columnWidth, (canvas.height - wallHeight) / 2, columnWidth + 1, wallHeight);
  }
}

function projectSprite(worldX, worldY, baseSize, color) {
  const dx = worldX - player.x;
  const dy = worldY - player.y;
  const dist = Math.hypot(dx, dy);
  const angleToSprite = Math.atan2(dy, dx) - player.angle;
  const normalizedAngle = Math.atan2(Math.sin(angleToSprite), Math.cos(angleToSprite));

  if (Math.abs(normalizedAngle) > FOV * 0.7 || dist < 0.2 || dist > MAX_VIEW_DISTANCE) return;

  const rayHit = castRay(player.angle + normalizedAngle);
  if (rayHit.distance < dist) return;

  const screenX = (0.5 + normalizedAngle / FOV) * canvas.width;
  const size = (canvas.height * baseSize) / dist;
  const screenY = canvas.height / 2 + size * 0.1;

  const brightness = player.flashlightOn ? Math.max(0.2, 1.25 - dist / 9) : Math.max(0.1, 0.4 - dist / 16);

  ctx.save();
  ctx.globalAlpha = brightness;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(screenX, screenY, size * 0.25, size * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRelicsAndMonster() {
  for (const relic of relics) {
    if (!relic.collected) {
      const pulse = 0.35 + Math.sin(noisePulse * 6 + relic.x) * 0.12;
      projectSprite(relic.x, relic.y, 0.75 + pulse, "#b96dff");
    }
  }
  projectSprite(monster.x, monster.y, 1.25, "#d9d6dd");
}

function drawFlashlightMask() {
  const radius = player.flashlightOn ? canvas.height * 0.54 : canvas.height * 0.26;
  const gradient = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    radius * 0.05,
    canvas.width / 2,
    canvas.height / 2,
    radius
  );

  if (player.flashlightOn) {
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(0.55, "rgba(0, 0, 0, 0.48)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.92)");
  } else {
    gradient.addColorStop(0, "rgba(0, 0, 0, 0.7)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.98)");
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(255,255,255,0.17)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2 - 10, canvas.height / 2);
  ctx.lineTo(canvas.width / 2 + 10, canvas.height / 2);
  ctx.moveTo(canvas.width / 2, canvas.height / 2 - 10);
  ctx.lineTo(canvas.width / 2, canvas.height / 2 + 10);
  ctx.stroke();
}

function movePlayer(dt) {
  let speed = MOVE_SPEED;
  const wantsSprint = keys.has("Shift") && keys.has("KeyW") && player.stamina > 3;
  if (wantsSprint) {
    speed *= SPRINT_MULTIPLIER;
    player.stamina = Math.max(0, player.stamina - 24 * dt);
  } else {
    player.stamina = Math.min(100, player.stamina + 16 * dt);
  }

  let moveX = 0;
  let moveY = 0;
  if (keys.has("KeyW")) {
    moveX += Math.cos(player.angle);
    moveY += Math.sin(player.angle);
  }
  if (keys.has("KeyS")) {
    moveX -= Math.cos(player.angle);
    moveY -= Math.sin(player.angle);
  }
  if (keys.has("KeyA")) {
    moveX += Math.cos(player.angle - Math.PI / 2);
    moveY += Math.sin(player.angle - Math.PI / 2);
  }
  if (keys.has("KeyD")) {
    moveX += Math.cos(player.angle + Math.PI / 2);
    moveY += Math.sin(player.angle + Math.PI / 2);
  }

  const len = Math.hypot(moveX, moveY) || 1;
  moveX = (moveX / len) * speed * dt;
  moveY = (moveY / len) * speed * dt;

  const nextX = player.x + moveX;
  const nextY = player.y + moveY;

  if (!isWall(nextX, player.y)) player.x = nextX;
  if (!isWall(player.x, nextY)) player.y = nextY;
}

function updateMonster(dt) {
  monster.moveTimer -= dt;

  const dx = player.x - monster.x;
  const dy = player.y - monster.y;
  const dist = Math.hypot(dx, dy);

  if (monster.moveTimer <= 0) {
    monster.moveTimer = 0.1;
    const dirX = dx / (dist || 1);
    const dirY = dy / (dist || 1);
    const mx = monster.x + dirX * monster.speed * 0.1;
    const my = monster.y + dirY * monster.speed * 0.1;
    if (!isWall(mx, monster.y)) monster.x = mx;
    if (!isWall(monster.x, my)) monster.y = my;
  }

  if (dist < 0.65) {
    player.alive = false;
    showMessage("The creature found you. Click to retry.");
    stopAudio();
    document.exitPointerLock?.();
  }

  if (dist < 4 && heartbeatCooldown <= 0) {
    playHeartbeat(1 - dist / 4);
    heartbeatCooldown = 0.7;
  }
}

function collectRelics() {
  for (const relic of relics) {
    if (!relic.collected) {
      const dist = Math.hypot(relic.x - player.x, relic.y - player.y);
      if (dist < 0.8) {
        relic.collected = true;
        player.relics += 1;
        playChime();
        showMessage(`Relic claimed (${player.relics}/4)`);
      }
    }
  }
}

function updateObjective() {
  objectiveEl.textContent = `Relics: ${player.relics} / 4`;
  statusEl.textContent = `Flashlight: ${player.flashlightOn ? "ON" : "OFF"}${muted ? " · MUTE" : ""}`;
  staminaEl.textContent = `Stamina: ${Math.round(player.stamina)}%`;
}

function checkWin() {
  if (player.relics === relics.length && isExit(player.x, player.y)) {
    player.won = true;
    showMessage("You escaped the mansion. Click to play again.");
    stopAudio();
    document.exitPointerLock?.();
  }
}

function showMessage(text) {
  messageEl.textContent = text;
  messageEl.classList.remove("hidden");
  setTimeout(() => {
    if (!player.alive || player.won) return;
    messageEl.classList.add("hidden");
  }, 2200);
}

let audioContext;
let ambienceNode;
let gainNode;

function ensureAudio() {
  if (audioContext) return;
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  gainNode = audioContext.createGain();
  gainNode.gain.value = 0.45;
  gainNode.connect(audioContext.destination);
  startAmbience();
}

function startAmbience() {
  if (!audioContext || ambienceNode) return;

  const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * 0.22;
  }

  const noise = audioContext.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;

  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 420;

  const tremolo = audioContext.createGain();
  tremolo.gain.value = 0.09;

  noise.connect(filter);
  filter.connect(tremolo);
  tremolo.connect(gainNode);
  noise.start();

  ambienceNode = { noise, tremolo };
}

function stopAudio() {
  if (ambienceNode) {
    ambienceNode.noise.stop();
    ambienceNode = null;
  }
}

function setMuted(value) {
  muted = value;
  if (gainNode) {
    gainNode.gain.value = muted ? 0 : 0.45;
  }
  updateObjective();
}

function beep(freq, duration, type = "sine", volume = 0.08) {
  if (!audioContext || muted) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(gainNode);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
  osc.stop(audioContext.currentTime + duration);
}

function playFootstep(power) {
  beep(90 + Math.random() * 45, 0.08, "triangle", 0.04 + power * 0.03);
}

function playHeartbeat(intensity) {
  beep(42, 0.14, "sine", 0.08 + intensity * 0.09);
  setTimeout(() => beep(42, 0.12, "sine", 0.07 + intensity * 0.07), 130);
}

function playChime() {
  beep(420, 0.22, "sine", 0.07);
  setTimeout(() => beep(620, 0.2, "triangle", 0.06), 80);
}

let stepTimer = 0;

function gameLoop(timestamp) {
  if (!gameStarted) return;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.033);
  lastTime = timestamp;
  noisePulse += dt;
  heartbeatCooldown -= dt;

  if (player.alive && !player.won) {
    movePlayer(dt);
    updateMonster(dt);
    collectRelics();
    checkWin();

    const moving = ["KeyW", "KeyA", "KeyS", "KeyD"].some((code) => keys.has(code));
    if (moving) {
      stepTimer -= dt;
      if (stepTimer <= 0) {
        playFootstep(keys.has("Shift") ? 1 : 0.35);
        stepTimer = keys.has("Shift") ? 0.22 : 0.34;
      }
    }
  }

  drawBackground();
  drawWorld();
  drawRelicsAndMonster();
  drawFlashlightMask();
  updateObjective();

  gameLoopId = requestAnimationFrame(gameLoop);
}

function resetGame() {
  player.x = 1.7;
  player.y = 1.7;
  player.angle = Math.PI / 4;
  player.stamina = 100;
  player.flashlightOn = true;
  player.relics = 0;
  player.alive = true;
  player.won = false;

  monster.x = 14.5;
  monster.y = 12.5;

  relics.forEach((r) => {
    r.collected = false;
  });

  messageEl.classList.add("hidden");
  showMessage("Find the relics. Avoid the creature.");
}

function startGame() {
  ensureAudio();
  audioContext?.resume();
  resetGame();
  gameStarted = true;
  overlay.classList.add("hidden");
  hud.classList.remove("hidden");
  canvas.requestPointerLock?.();
  lastTime = performance.now();
  cancelAnimationFrame(gameLoopId);
  gameLoopId = requestAnimationFrame(gameLoop);
}

startButton.addEventListener("click", startGame);

document.addEventListener("keydown", (event) => {
  if (event.code === "KeyF") {
    player.flashlightOn = !player.flashlightOn;
    showMessage(player.flashlightOn ? "Flashlight on" : "Flashlight off");
    return;
  }
  if (event.code === "KeyM") {
    setMuted(!muted);
    showMessage(muted ? "Audio muted" : "Audio enabled");
    return;
  }
  if (event.code === "Enter" && !gameStarted) {
    startGame();
    return;
  }
  keys.add(event.code);

  if ((!player.alive || player.won) && event.code === "Space") {
    startGame();
  }
});

document.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== canvas || !player.alive || player.won) return;
  player.angle += event.movementX * ROTATION_SPEED;
});

canvas.addEventListener("click", () => {
  if (!gameStarted) return;

  if (!player.alive || player.won) {
    startGame();
    return;
  }

  if (document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.();
  }
});

drawBackground();
ctx.fillStyle = "#d6cbff";
ctx.font = "24px Segoe UI";
ctx.textAlign = "center";
ctx.fillText("Whispering Halls", canvas.width / 2, canvas.height / 2 - 10);
ctx.font = "16px Segoe UI";
ctx.fillText("Click Enter the Mansion to begin", canvas.width / 2, canvas.height / 2 + 20);
