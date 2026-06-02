const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const lerp = (from, to, t) => from + (to - from) * t;

const state = {
  mode: "beginner",
  speed: 325,
  gear: 7,
  rpm: 11500,
  fuel: 15,
  lapTime: 95.21,
  delta: 0.45,
  position: "8/20",
  tyres: {
    FL: 102,
    FR: 105,
    RL: 98,
    RR: 107,
  },
  throttle: 0,
  brake: 0,
  steering: 0,
  diffLock: 50,
  brakeBias: 56,
  health: 100,
};

const keys = {
  w: false,
  s: false,
  a: false,
  d: false,
  shift: false,
  control: false,
};

const els = {
  shell: document.getElementById("simShell"),
  sessionPhase: document.getElementById("sessionPhase"),
  raceClock: document.getElementById("raceClock"),
  beginnerHud: document.getElementById("beginnerHud"),
  advancedHud: document.getElementById("advancedHud"),
  beginnerSpeed: document.getElementById("beginnerSpeed"),
  beginnerGear: document.getElementById("beginnerGear"),
  beginnerStatus: document.getElementById("beginnerStatus"),
  beginnerStatusText: document.getElementById("beginnerStatusText"),
  raceAlert: document.getElementById("raceAlert"),
  alertText: document.getElementById("alertText"),
  lapTime: document.getElementById("lapTime"),
  deltaTime: document.getElementById("deltaTime"),
  position: document.getElementById("position"),
  fuel: document.getElementById("fuel"),
  advancedSpeed: document.getElementById("advancedSpeed"),
  advancedGear: document.getElementById("advancedGear"),
  rpm: document.getElementById("rpm"),
  maxTyre: document.getElementById("maxTyre"),
  throttleBar: document.getElementById("throttleBar"),
  brakeBar: document.getElementById("brakeBar"),
  steerBar: document.getElementById("steerBar"),
  diffValue: document.getElementById("diffValue"),
  brakeValue: document.getElementById("brakeValue"),
  guideCard: document.getElementById("guideCard"),
  guideProgress: document.getElementById("guideProgress"),
  closeGuide: document.getElementById("closeGuide"),
  trackCanvas: document.getElementById("dynamicTrack"),
};

const tyreCells = Array.from(document.querySelectorAll(".tyre-cell"));
const modeButtons = Array.from(document.querySelectorAll(".mode-btn"));
const keyChips = Array.from(document.querySelectorAll(".key-chip"));
const setupRows = Array.from(document.querySelectorAll(".setup-row"));
const trackCtx = els.trackCanvas.getContext("2d");

let lastFrame = performance.now();
let guideStartedAt = performance.now();
const virtualPressStarts = new Map();
const virtualReleaseTimers = new Map();
const trackState = {
  width: 0,
  height: 0,
  dpr: 1,
  distance: 0,
  lateral: 0,
  visualSpeed: state.speed,
  brakePulse: 0,
  canvasReady: false,
};

window.__racingHudDebug = {
  keys,
  state,
  trackState,
};

function formatLap(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
}

function formatDelta(delta) {
  const sign = delta >= 0 ? "+" : "-";
  return `(${sign}${Math.abs(delta).toFixed(2)})`;
}

function setMode(mode) {
  state.mode = mode;
  const isBeginner = mode === "beginner";
  els.beginnerHud.classList.toggle("is-visible", isBeginner);
  els.advancedHud.classList.toggle("is-visible", !isBeginner);

  modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function popValue(element) {
  element.classList.remove("value-pop");
  void element.offsetWidth;
  element.classList.add("value-pop");
}

function shiftGear(direction) {
  const nextGear = clamp(state.gear + direction, 1, 8);
  if (nextGear === state.gear) return;

  state.gear = nextGear;
  popValue(els.beginnerGear);
  popValue(els.advancedGear);
}

function updateControl(control, direction) {
  if (control === "diff") {
    state.diffLock = clamp(state.diffLock + direction * 5, 30, 80);
    popValue(els.diffValue);
  }

  if (control === "brake") {
    state.brakeBias = clamp(state.brakeBias + direction * 2, 48, 62);
    popValue(els.brakeValue);
  }

  const row = setupRows.find((item) => item.dataset.controlRow === control);
  if (!row) return;

  row.classList.add("is-flashing");
  window.setTimeout(() => row.classList.remove("is-flashing"), 260);
}

function setKey(key, pressed) {
  if (key in keys) {
    keys[key] = pressed;
  }
}

function handleKeyDown(event) {
  const key = event.key.toLowerCase();
  if (["w", "a", "s", "d", "shift", "control"].includes(key)) {
    event.preventDefault();
  }

  if (key === "shift" && !event.repeat) {
    shiftGear(1);
  }

  if (key === "control" && !event.repeat) {
    shiftGear(-1);
  }

  setKey(key, true);
}

function handleKeyUp(event) {
  setKey(event.key.toLowerCase(), false);
}

function pressVirtualKey(key) {
  if (!(key in keys)) return;

  if (virtualReleaseTimers.has(key)) {
    window.clearTimeout(virtualReleaseTimers.get(key));
    virtualReleaseTimers.delete(key);
  }

  virtualPressStarts.set(key, performance.now());
  setKey(key, true);

  if (key === "shift") {
    shiftGear(1);
  }

  if (key === "control") {
    shiftGear(-1);
  }

  // Make a click/tap visible even if the user does not hold the pointer down.
  if (key === "w") {
    state.throttle = 1;
    state.speed = clamp(state.speed + 12, 0, 362);
  }

  if (key === "s") {
    state.brake = 1;
    state.speed = clamp(state.speed - 22, 0, 362);
    state.tyres.FL = clamp(state.tyres.FL + 7, 70, 130);
    state.tyres.FR = clamp(state.tyres.FR + 8, 70, 130);
  }

  if (key === "a") {
    state.steering = -1;
    state.tyres.FR = clamp(state.tyres.FR + 4, 70, 130);
  }

  if (key === "d") {
    state.steering = 1;
    state.tyres.FL = clamp(state.tyres.FL + 4, 70, 130);
  }

}

function releaseVirtualKey(key) {
  if (!(key in keys)) return;

  if (virtualReleaseTimers.has(key)) {
    window.clearTimeout(virtualReleaseTimers.get(key));
    virtualReleaseTimers.delete(key);
  }

  const pressedAt = virtualPressStarts.get(key) ?? performance.now();
  const minHold = key === "shift" || key === "control" ? 160 : 520;
  const releaseDelay = Math.max(0, minHold - (performance.now() - pressedAt));
  virtualPressStarts.delete(key);

  virtualReleaseTimers.set(
    key,
    window.setTimeout(() => {
      setKey(key, false);
      virtualReleaseTimers.delete(key);
    }, releaseDelay),
  );
}

function resizeDynamicTrack() {
  const rect = els.trackCanvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);

  if (els.trackCanvas.width !== pixelWidth || els.trackCanvas.height !== pixelHeight) {
    els.trackCanvas.width = pixelWidth;
    els.trackCanvas.height = pixelHeight;
  }

  trackState.width = width;
  trackState.height = height;
  trackState.dpr = dpr;
}

function updateDynamicTrack(dt) {
  trackState.visualSpeed = lerp(trackState.visualSpeed, state.speed, clamp(dt * 4.5, 0, 1));
  trackState.lateral = lerp(trackState.lateral, state.steering, clamp(dt * 4.2, 0, 1));
  trackState.brakePulse = lerp(trackState.brakePulse, state.brake, clamp(dt * 7, 0, 1));
  trackState.distance += (trackState.visualSpeed * 1.65 + state.throttle * 140 + 24) * dt;

  const speedRatio = clamp(trackState.visualSpeed / 360, 0, 1);
  const shake = (state.throttle * 1.8 + state.brake * 2.5 + Math.abs(state.steering) * 1.2) * speedRatio;
  const shakePhase = trackState.distance * 0.18;
  const sceneX = trackState.lateral * -12 + Math.sin(shakePhase) * shake;
  const sceneY = state.brake * 9 - state.throttle * 3 + Math.cos(shakePhase * 0.7) * shake * 0.5;

  els.shell.style.setProperty("--road-x", `${trackState.lateral * -18}px`);
  els.shell.style.setProperty("--road-y", `${state.brake * 5 - state.throttle * 4}px`);
  els.shell.style.setProperty("--road-tilt", `${trackState.lateral * -1.4}deg`);
  els.shell.style.setProperty("--road-scale", String(1 + state.throttle * 0.012 + state.brake * 0.006));
  els.shell.style.setProperty("--scene-x", `${sceneX}px`);
  els.shell.style.setProperty("--scene-y", `${sceneY}px`);
  els.shell.style.setProperty("--scene-scale", String(1.02 + state.throttle * 0.012 + state.brake * 0.004));
  els.shell.style.setProperty("--speed-line-opacity", String(0.18 + speedRatio * 0.22 + state.throttle * 0.16));
}

function drawRoadSection(ctx, points, color) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  ctx.lineTo(points[1].x, points[1].y);
  ctx.lineTo(points[2].x, points[2].y);
  ctx.lineTo(points[3].x, points[3].y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function roadGeometry(progress, horizon, bottom, width) {
  const perspective = progress * progress;
  const y = horizon + perspective * (bottom - horizon);
  const curve =
    Math.sin(trackState.distance / 460 + progress * 2.8) * 0.12 +
    Math.sin(trackState.distance / 900) * 0.08;
  const center = width * (0.5 + trackState.lateral * 0.13 + curve * progress);
  const roadWidth = width * (0.09 + Math.pow(progress, 1.35) * 0.86);

  return {
    y,
    center,
    roadWidth,
    left: center - roadWidth * 0.5,
    right: center + roadWidth * 0.5,
  };
}

function drawDynamicTrack() {
  resizeDynamicTrack();

  const ctx = trackCtx;
  const width = trackState.width;
  const height = trackState.height;
  const dpr = trackState.dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const horizon = height * 0.27;
  const bottom = height * 0.9;
  const speedRatio = clamp(trackState.visualSpeed / 360, 0, 1);
  const segmentCount = 44;
  const lanePhase = Math.floor(trackState.distance / 22);

  const skyShade = ctx.createLinearGradient(0, horizon * 0.45, 0, bottom);
  skyShade.addColorStop(0, "rgba(5, 8, 10, 0)");
  skyShade.addColorStop(0.55, "rgba(5, 8, 10, 0.08)");
  skyShade.addColorStop(1, "rgba(5, 8, 10, 0.2)");
  ctx.fillStyle = skyShade;
  ctx.fillRect(0, 0, width, bottom);

  for (let i = 0; i < segmentCount; i += 1) {
    const p0 = i / segmentCount;
    const p1 = (i + 1) / segmentCount;
    const g0 = roadGeometry(p0, horizon, bottom, width);
    const g1 = roadGeometry(p1, horizon, bottom, width);
    const near = p1;
    const stripe = (i + lanePhase) % 6 < 3;
    const asphaltLight = 34 + near * 24 + speedRatio * 10;
    const asphalt = stripe
      ? `rgba(${asphaltLight}, ${asphaltLight + 3}, ${asphaltLight + 5}, ${0.28 + near * 0.34})`
      : `rgba(${asphaltLight - 9}, ${asphaltLight - 6}, ${asphaltLight - 3}, ${0.26 + near * 0.32})`;

    drawRoadSection(
      ctx,
      [
        { x: g0.left, y: g0.y },
        { x: g0.right, y: g0.y },
        { x: g1.right, y: g1.y },
        { x: g1.left, y: g1.y },
      ],
      asphalt,
    );

    const curbWidth0 = Math.max(2, g0.roadWidth * 0.045);
    const curbWidth1 = Math.max(2, g1.roadWidth * 0.045);
    const curbColor = (i + lanePhase) % 2 === 0 ? "rgba(224, 42, 42, 0.7)" : "rgba(240, 244, 246, 0.78)";

    drawRoadSection(
      ctx,
      [
        { x: g0.left - curbWidth0, y: g0.y },
        { x: g0.left, y: g0.y },
        { x: g1.left, y: g1.y },
        { x: g1.left - curbWidth1, y: g1.y },
      ],
      curbColor,
    );
    drawRoadSection(
      ctx,
      [
        { x: g0.right, y: g0.y },
        { x: g0.right + curbWidth0, y: g0.y },
        { x: g1.right + curbWidth1, y: g1.y },
        { x: g1.right, y: g1.y },
      ],
      curbColor,
    );

    if ((i + lanePhase) % 7 < 3 && near > 0.08) {
      const lineWidth0 = Math.max(1, g0.roadWidth * 0.008);
      const lineWidth1 = Math.max(1, g1.roadWidth * 0.008);
      const laneOffset0 = g0.roadWidth * 0.18;
      const laneOffset1 = g1.roadWidth * 0.18;
      const lineColor = `rgba(255, 255, 255, ${0.16 + near * 0.38})`;

      [-1, 1].forEach((side) => {
        drawRoadSection(
          ctx,
          [
            { x: g0.center + side * laneOffset0 - lineWidth0, y: g0.y },
            { x: g0.center + side * laneOffset0 + lineWidth0, y: g0.y },
            { x: g1.center + side * laneOffset1 + lineWidth1, y: g1.y },
            { x: g1.center + side * laneOffset1 - lineWidth1, y: g1.y },
          ],
          lineColor,
        );
      });
    }

    if (i % 4 === 0 && near > 0.18) {
      const railAlpha = 0.06 + near * 0.18;
      ctx.strokeStyle = `rgba(210, 230, 232, ${railAlpha})`;
      ctx.lineWidth = Math.max(1, near * 3);
      ctx.beginPath();
      ctx.moveTo(g1.left - g1.roadWidth * 0.18, g1.y);
      ctx.lineTo(g1.left - g1.roadWidth * 0.34, g1.y - 10 * near);
      ctx.moveTo(g1.right + g1.roadWidth * 0.18, g1.y);
      ctx.lineTo(g1.right + g1.roadWidth * 0.34, g1.y - 10 * near);
      ctx.stroke();
    }
  }

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.04 + speedRatio * 0.18})`;
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 26; i += 1) {
    const spread = (i / 25 - 0.5) * width * 1.45;
    const startX = width * 0.5 + spread * 0.12 + trackState.lateral * width * 0.08;
    const endX = width * 0.5 + spread;
    ctx.beginPath();
    ctx.moveTo(startX, horizon + 10);
    ctx.lineTo(endX, bottom - height * 0.08);
    ctx.stroke();
  }
  ctx.restore();

  if (trackState.brakePulse > 0.08) {
    const brake = clamp(trackState.brakePulse, 0, 1);
    const brakeGradient = ctx.createRadialGradient(width * 0.5, height * 0.58, 40, width * 0.5, height * 0.58, width * 0.72);
    brakeGradient.addColorStop(0, `rgba(255, 82, 82, ${0.04 * brake})`);
    brakeGradient.addColorStop(1, `rgba(255, 82, 82, ${0.16 * brake})`);
    ctx.fillStyle = brakeGradient;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  const fade = ctx.createLinearGradient(0, height * 0.38, 0, height);
  fade.addColorStop(0, "rgba(0, 0, 0, 0)");
  fade.addColorStop(0.35, "rgba(0, 0, 0, 0.24)");
  fade.addColorStop(0.62, "rgba(0, 0, 0, 0.9)");
  fade.addColorStop(1, "rgba(0, 0, 0, 1)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, height * 0.38, width, height * 0.62);
  ctx.restore();

  trackState.canvasReady = true;
  els.trackCanvas.dataset.roadDistance = String(Math.round(trackState.distance));
  els.trackCanvas.dataset.roadSpeed = String(Math.round(trackState.visualSpeed));
  els.trackCanvas.dataset.roadLateral = trackState.lateral.toFixed(3);
}

function updatePhysics(dt) {
  const targetThrottle = keys.w ? 1 : 0;
  const targetBrake = keys.s ? 1 : 0;
  const targetSteering = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);

  state.throttle = lerp(state.throttle, targetThrottle, clamp(dt * 7, 0, 1));
  state.brake = lerp(state.brake, targetBrake, clamp(dt * 9, 0, 1));
  state.steering = lerp(state.steering, targetSteering, clamp(dt * 8, 0, 1));

  const drag = 0.018 * state.speed;
  const cruiseAssist = targetThrottle === 0 && targetBrake === 0 ? (336 - state.speed) * 0.45 : 0;
  const throttleAccel = state.throttle * (34 + state.gear * 4);
  const brakeDecel = state.brake * (132 + (state.brakeBias - 54) * 2.5);
  const steeringScrub = Math.abs(state.steering) * Math.max(0, state.speed - 120) * 0.028;
  state.speed = clamp(state.speed + (throttleAccel + cruiseAssist - brakeDecel - drag - steeringScrub) * dt, 0, 362);

  const rpmTarget = clamp(2500 + state.speed * 26 + state.throttle * 1550 + state.gear * 170 - state.brake * 900, 1100, 12800);
  state.rpm = lerp(state.rpm, rpmTarget, clamp(dt * 7, 0, 1));

  state.fuel = clamp(state.fuel - (state.throttle * 0.026 + state.speed * 0.000012) * dt, 0, 15);
  state.lapTime += dt;

  let paceTrend = 0.024;
  if (state.speed > 330 && state.throttle > 0.5 && state.brake < 0.15) {
    paceTrend = -0.28;
  } else if (state.speed > 285 && state.brake < 0.15) {
    paceTrend = -0.08;
  }
  const mistakePenalty = state.brake > 0.65 || Math.abs(state.steering) > 0.7 ? 0.05 : 0;
  state.delta = clamp(state.delta + (paceTrend + mistakePenalty) * dt, -1.25, 1.85);

  updateTyres(dt);
}

function updateTyres(dt) {
  const coolTarget = 94;
  Object.keys(state.tyres).forEach((tyre) => {
    state.tyres[tyre] = lerp(state.tyres[tyre], coolTarget, clamp(dt * 0.045, 0, 1));
  });

  if (state.brake > 0.08) {
    const frontHeat = state.brake * (12 + (state.brakeBias - 50) * 0.85) * dt;
    const rearHeat = state.brake * 4.2 * dt;
    state.tyres.FL += frontHeat;
    state.tyres.FR += frontHeat * 1.05;
    state.tyres.RL += rearHeat;
    state.tyres.RR += rearHeat;
  }

  if (Math.abs(state.steering) > 0.08 && state.speed > 150) {
    const cornerLoad = Math.abs(state.steering) * (state.speed / 220) * dt;
    if (state.steering < 0) {
      state.tyres.FR += cornerLoad * 6.6;
      state.tyres.RR += cornerLoad * (4.2 + state.diffLock / 40);
    } else {
      state.tyres.FL += cornerLoad * 6.6;
      state.tyres.RL += cornerLoad * (4.2 + state.diffLock / 40);
    }
  }

  Object.keys(state.tyres).forEach((tyre) => {
    state.tyres[tyre] = clamp(state.tyres[tyre], 70, 130);
  });

  const maxTemp = Math.max(...Object.values(state.tyres));
  if (maxTemp > 118) {
    state.health = clamp(state.health - dt * 3.5, 0, 100);
  } else if (maxTemp < 106) {
    state.health = clamp(state.health + dt * 1.4, 0, 100);
  }
}

function renderTyres() {
  let maxTyre = ["FL", state.tyres.FL];
  Object.entries(state.tyres).forEach(([tyre, temp]) => {
    if (temp > maxTyre[1]) {
      maxTyre = [tyre, temp];
    }
  });

  tyreCells.forEach((cell) => {
    const tyre = cell.dataset.tyre;
    const temp = Math.round(state.tyres[tyre]);
    cell.querySelector("strong").textContent = `${temp}°C`;
    cell.classList.toggle("is-warm", temp > 100 && temp <= 110);
    cell.classList.toggle("is-danger", temp > 110);
  });

  els.maxTyre.textContent = `MAX ${Math.round(maxTyre[1])}°C`;
  return maxTyre;
}

function renderStatus(maxTyre) {
  const isDanger = maxTyre[1] > 110 || state.health < 55;
  els.shell.classList.toggle("has-danger", isDanger);
  els.beginnerStatus.classList.toggle("is-danger", isDanger);
  els.beginnerStatus.classList.toggle("is-ok", !isDanger);
  els.raceAlert.classList.toggle("is-visible", isDanger);

  if (isDanger) {
    els.beginnerStatusText.textContent = "轮胎过热警告 (TYRES HOT)";
    els.alertText.textContent = `${maxTyre[0]} ${Math.round(maxTyre[1])}°C`;
    els.sessionPhase.textContent = "ALERT";
  } else {
    els.beginnerStatusText.textContent = "车辆状态：良好 (TYRES OK)";
    els.sessionPhase.textContent = state.speed > 280 ? "PUSH LAP" : "RACE RUN";
  }
}

function renderKeyChips() {
  keyChips.forEach((chip) => {
    const key = chip.dataset.keychip;
    chip.classList.toggle("is-pressed", Boolean(keys[key]));
  });
}

function renderGuide(now) {
  const elapsed = (now - guideStartedAt) / 1000;
  const remainingRatio = clamp(1 - elapsed / 30, 0, 1);
  els.guideProgress.style.transform = `scaleX(${remainingRatio})`;

  if (elapsed >= 30) {
    els.guideCard.classList.add("is-hidden");
  }
}

function render(now) {
  const roundedSpeed = Math.round(state.speed);
  const roundedRpm = Math.round(state.rpm / 10) * 10;
  const maxTyre = renderTyres();

  els.shell.style.setProperty("--motion-x", `${state.steering * -8}px`);
  els.beginnerSpeed.textContent = String(roundedSpeed);
  els.beginnerGear.textContent = String(state.gear);
  els.advancedSpeed.textContent = String(roundedSpeed);
  els.advancedGear.textContent = String(state.gear);
  els.rpm.textContent = String(roundedRpm);
  els.lapTime.textContent = formatLap(state.lapTime);
  els.raceClock.textContent = formatLap(state.lapTime);
  els.deltaTime.textContent = formatDelta(state.delta);
  els.deltaTime.classList.toggle("is-loss", state.delta >= 0);
  els.deltaTime.classList.toggle("is-gain", state.delta < 0);
  els.position.textContent = state.position;
  els.fuel.textContent = `${state.fuel.toFixed(1)}L`;
  els.diffValue.textContent = `${state.diffLock}%`;
  els.brakeValue.textContent = `${state.brakeBias}%`;
  els.throttleBar.style.width = `${Math.round(state.throttle * 100)}%`;
  els.brakeBar.style.width = `${Math.round(state.brake * 100)}%`;
  els.steerBar.style.width = `${Math.max(2, Math.abs(state.steering) * 50)}%`;
  els.steerBar.style.transform = state.steering < 0 ? "scaleX(-1)" : "scaleX(1)";

  renderStatus(maxTyre);
  renderKeyChips();
  renderGuide(now);
}

function tick(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  updatePhysics(dt);
  updateDynamicTrack(dt);
  drawDynamicTrack();
  render(now);
  requestAnimationFrame(tick);
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

keyChips.forEach((chip) => {
  chip.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    chip.setPointerCapture?.(event.pointerId);
    pressVirtualKey(chip.dataset.keychip);
  });

  chip.addEventListener("pointerup", (event) => {
    event.preventDefault();
    releaseVirtualKey(chip.dataset.keychip);
  });

  chip.addEventListener("pointercancel", () => {
    releaseVirtualKey(chip.dataset.keychip);
  });

  chip.addEventListener("lostpointercapture", () => {
    releaseVirtualKey(chip.dataset.keychip);
  });
});

document.querySelectorAll(".arrow-btn").forEach((button) => {
  button.addEventListener("click", () => {
    updateControl(button.dataset.control, Number(button.dataset.dir));
  });
});

els.closeGuide.addEventListener("click", () => {
  els.guideCard.classList.add("is-hidden");
});

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("blur", () => {
  Object.keys(keys).forEach((key) => {
    keys[key] = false;
  });
  virtualReleaseTimers.forEach((timer) => window.clearTimeout(timer));
  virtualReleaseTimers.clear();
  virtualPressStarts.clear();
});

window.addEventListener("resize", resizeDynamicTrack);

resizeDynamicTrack();
drawDynamicTrack();
render(performance.now());
requestAnimationFrame(tick);
