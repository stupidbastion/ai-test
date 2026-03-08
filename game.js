const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

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

const map = [
  "111111111111111111111",
  "100000000000000000001",
  "101111111011111111101",
  "101000001010000000101",
  "101011101010111110101",
  "101010001010100010101",
  "101010111010101010101",
  "101000100000101010101",
  "101110101111101010101",
  "100010100000001000001",
  "111010101111101111101",
  "100000101000001000001",
  "101111101011111011101",
  "101000001000001000001",
  "101011111111101111101",
  "1000000000000000000E1",
  "111111111111111111111"
].map((r) => r.split(""));

const state = {
  started: false,
  paused: false,
  fov: 75,
  quality: "high",
  controls: { forward: "KeyW", sprint: "ShiftLeft", flashlight: "KeyF" },
  player: { x: 1.7, y: 1.7, a: Math.PI / 4, z: 0, vz: 0, stamina: 100, flashlight: true, bob: 0 },
  sigils: [
    { x: 3.5, y: 5.5, got: false },
    { x: 8.5, y: 3.5, got: false },
    { x: 14.5, y: 8.5, got: false },
    { x: 11.5, y: 14.5, got: false }
  ],
  thought: "",
  collected: 0
};

const keys = new Set();
const roomThoughts = [
  { x1: 2, y1: 2, x2: 6, y2: 6, text: "Doesn't look like anything good happened here..." },
  { x1: 7, y1: 2, x2: 12, y2: 6, text: "The wallpaper is peeling like skin." },
  { x1: 2, y1: 10, x2: 7, y2: 14, text: "I hear whispers from behind the portrait." },
  { x1: 9, y1: 10, x2: 15, y2: 15, text: "Someone locked this room from the inside." }
];

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}
addEventListener("resize", resize);
resize();

function wallAt(x, y) {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  const row = map[gy];
  if (!row) return true;
  return row[gx] === "1" || row[gx] === undefined;
}

function isExit(x, y) {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  return map[gy] && map[gy][gx] === "E";
}

function cast(angle) {
  let d = 0;
  while (d < 25) {
    d += 0.02;
    const rx = state.player.x + Math.cos(angle) * d;
    const ry = state.player.y + Math.sin(angle) * d;
    if (wallAt(rx, ry)) return d;
  }
  return 25;
}

function move(dt) {
  const p = state.player;
  const fwd = keys.has(state.controls.forward);
  const sprint = keys.has(state.controls.sprint) && fwd && p.stamina > 4;
  const speed = sprint ? 3.8 : 2.4;
  p.stamina = sprint ? Math.max(0, p.stamina - 28 * dt) : Math.min(100, p.stamina + 16 * dt);

  let mx = 0, my = 0;
  if (fwd) { mx += Math.cos(p.a); my += Math.sin(p.a); }
  if (keys.has("KeyS")) { mx -= Math.cos(p.a); my -= Math.sin(p.a); }
  if (keys.has("KeyA")) { mx += Math.cos(p.a - Math.PI / 2); my += Math.sin(p.a - Math.PI / 2); }
  if (keys.has("KeyD")) { mx += Math.cos(p.a + Math.PI / 2); my += Math.sin(p.a + Math.PI / 2); }

  const len = Math.hypot(mx, my) || 1;
  mx = (mx / len) * speed * dt;
  my = (my / len) * speed * dt;

  const nx = p.x + mx;
  const ny = p.y + my;
  if (!wallAt(nx, p.y)) p.x = nx;
  if (!wallAt(p.x, ny)) p.y = ny;

  if ((mx || my) && p.z === 0) {
    p.bob += dt * (sprint ? 14 : 9);
  }

  p.vz -= 19 * dt;
  p.z += p.vz * dt;
  if (p.z < 0) { p.z = 0; p.vz = 0; }
}

function draw() {
  const p = state.player;
  const fov = (state.fov * Math.PI) / 180;
  const rays = state.quality === "high" ? 420 : state.quality === "medium" ? 300 : 210;
  const col = canvas.width / rays;

  const bobShift = Math.sin(p.bob) * 8 - p.z * 34;

  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.55);
  sky.addColorStop(0, "#0f1220");
  sky.addColorStop(1, "#1d1a20");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height / 2 + bobShift);

  const floor = ctx.createLinearGradient(0, canvas.height / 2 + bobShift, 0, canvas.height);
  floor.addColorStop(0, "#1a1714");
  floor.addColorStop(1, "#040404");
  ctx.fillStyle = floor;
  ctx.fillRect(0, canvas.height / 2 + bobShift, canvas.width, canvas.height / 2);

  for (let i = 0; i < rays; i++) {
    const ra = p.a - fov / 2 + (i / rays) * fov;
    const d = cast(ra) * Math.cos(ra - p.a);
    const h = Math.min(canvas.height, (canvas.height * 0.85) / (d + 0.01));
    const shade = Math.max(0.07, (p.flashlight ? 1.3 : 0.45) - d / 10);
    const c = Math.floor(145 * shade);
    ctx.fillStyle = `rgba(${c},${Math.floor(c*0.86)},${Math.floor(c*0.92)},1)`;
    ctx.fillRect(i * col, (canvas.height - h) / 2 + bobShift, col + 1, h);
  }

  for (const s of state.sigils) {
    if (s.got) continue;
    const dx = s.x - p.x, dy = s.y - p.y;
    const dist = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx) - p.a;
    const na = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(na) > fov * 0.6) continue;
    if (cast(p.a + na) < dist) continue;
    const sx = (0.5 + na / fov) * canvas.width;
    const size = (canvas.height * 0.42) / dist;
    ctx.globalAlpha = Math.max(0.2, 1.2 - dist / 9);
    ctx.fillStyle = "#ad71ff";
    ctx.beginPath();
    ctx.ellipse(sx, canvas.height / 2 + bobShift, size * 0.18, size * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const maskR = p.flashlight ? canvas.height * 0.58 : canvas.height * 0.28;
  const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, maskR * 0.1, canvas.width / 2, canvas.height / 2, maskR);
  g.addColorStop(0, p.flashlight ? "rgba(0,0,0,0)" : "rgba(0,0,0,.7)");
  g.addColorStop(1, "rgba(0,0,0,.95)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function updateThoughts() {
  for (const t of roomThoughts) {
    if (state.player.x >= t.x1 && state.player.x <= t.x2 && state.player.y >= t.y1 && state.player.y <= t.y2) {
      if (state.thought !== t.text) {
        state.thought = t.text;
        thought.textContent = t.text;
        thought.classList.remove("hidden");
        setTimeout(() => { if (state.thought === t.text) thought.classList.add("hidden"); }, 2800);
      }
      return;
    }
  }
}

function collect() {
  for (const s of state.sigils) {
    if (s.got) continue;
    if (Math.hypot(s.x - state.player.x, s.y - state.player.y) < 0.85) {
      s.got = true;
      state.collected += 1;
    }
  }
}

function updateHUD() {
  const escaped = state.collected === 4 && isExit(state.player.x, state.player.y);
  objective.textContent = escaped ? "You escaped Blackthorn Manor with the truth." : `Objective: Recover all memory sigils (${state.collected}/4) and reach the front gate.`;
  statusLine.textContent = `Stamina: ${Math.round(state.player.stamina)}% · Flashlight: ${state.player.flashlight ? "ON" : "OFF"} · Graphics: ${state.quality.toUpperCase()}`;
}

let last = performance.now();
function loop(t) {
  const dt = Math.min((t - last) / 1000, 0.033);
  last = t;
  if (state.started && !state.paused) {
    move(dt);
    collect();
    updateThoughts();
  }
  draw();
  updateHUD();
  requestAnimationFrame(loop);
}

function start() {
  state.started = true;
  overlay.classList.add("hidden");
  hud.classList.remove("hidden");
  canvas.requestPointerLock?.();
}

startBtn.addEventListener("click", start);

document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas || state.paused) return;
  state.player.a += e.movementX * 0.0026;
});

document.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "KeyP" && state.started) {
    state.paused = !state.paused;
    settingsPanel.classList.toggle("hidden", !state.paused);
    if (state.paused) document.exitPointerLock?.();
    else canvas.requestPointerLock?.();
  }
  if (e.code === state.controls.flashlight) state.player.flashlight = !state.player.flashlight;
  if (e.code === "Space" && state.player.z === 0) state.player.vz = 7.8;
});

document.addEventListener("keyup", (e) => keys.delete(e.code));
canvas.addEventListener("click", () => {
  if (state.started && !state.paused && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
});

fovSlider.addEventListener("input", () => {
  state.fov = Number(fovSlider.value);
  fovValue.textContent = String(state.fov);
});
qualitySelect.addEventListener("change", () => { state.quality = qualitySelect.value; });
forwardKeySelect.addEventListener("change", () => { state.controls.forward = forwardKeySelect.value; });
sprintKeySelect.addEventListener("change", () => { state.controls.sprint = sprintKeySelect.value; });
flashlightKeySelect.addEventListener("change", () => { state.controls.flashlight = flashlightKeySelect.value; });

requestAnimationFrame(loop);
