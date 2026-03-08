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
