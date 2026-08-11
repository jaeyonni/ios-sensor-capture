const $ = (id) => document.getElementById(id);
const els = {
  preview: $("preview"), status: $("capture-status"), heading: $("heading"), headingMeta: $("heading-meta"),
  gps: $("gps-readout"), orientation: $("orientation-readout"), motion: $("motion-readout"),
  panel: $("permission-panel"), enable: $("enable-button"), record: $("record-button"), export: $("export-button"),
  timer: $("timer"), notice: $("notice"), flip: $("flip-camera"), compatibility: $("compatibility")
};

const state = {
  facingMode: "environment", stream: null, recorder: null, chunks: [], videoMime: "", videoExtension: "webm",
  locationWatch: null, session: null, recording: false, timerId: null, latestHeading: null,
  samples: { orientation: [], motion: [], location: [] }, listenersAdded: false
};

const normalizeDegrees = (value) => ((value % 360) + 360) % 360;
const round = (value, digits = 4) => Number.isFinite(value) ? Number(value.toFixed(digits)) : "";
const sessionTime = () => state.session ? round(performance.now() - state.session.startedPerf, 3) : "";
const isoNow = () => new Date().toISOString();

function showNotice(message, timeout = 5000) {
  els.notice.textContent = message;
  els.notice.hidden = false;
  window.clearTimeout(showNotice.timeout);
  showNotice.timeout = window.setTimeout(() => { els.notice.hidden = true; }, timeout);
}

function selectedMime() {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm"
  ];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported(type)) || "";
}

async function requestMotionPermission() {
  const orientation = window.DeviceOrientationEvent;
  const motion = window.DeviceMotionEvent;
  if (typeof orientation?.requestPermission === "function") {
    const response = await orientation.requestPermission(true);
    if (response !== "granted") throw new Error("방향 센서 권한이 허용되지 않았습니다.");
  }
  if (typeof motion?.requestPermission === "function") {
    const response = await motion.requestPermission();
    if (response !== "granted") throw new Error("동작 센서 권한이 허용되지 않았습니다.");
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("이 브라우저는 카메라 API를 지원하지 않습니다.");
  state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: state.facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false
  });
  els.preview.srcObject = state.stream;
  await els.preview.play();
}

function attachSensors() {
  if (state.listenersAdded) return;
  state.listenersAdded = true;
  window.addEventListener("deviceorientationabsolute", onOrientation, true);
  window.addEventListener("deviceorientation", onOrientation, true);
  window.addEventListener("devicemotion", onMotion, true);
}

function onOrientation(event) {
  const screenAngle = window.screen?.orientation?.angle ?? window.orientation ?? 0;
  const appleHeading = Number(event.webkitCompassHeading);
  const alpha = Number(event.alpha);
  const heading = Number.isFinite(appleHeading) && appleHeading >= 0
    ? normalizeDegrees(appleHeading)
    : Number.isFinite(alpha) ? normalizeDegrees(360 - alpha + Number(screenAngle || 0)) : null;
  const source = Number.isFinite(appleHeading) && appleHeading >= 0
    ? "webkitCompassHeading" : event.absolute ? "deviceorientationabsolute" : "alpha-derived";
  const quality = source === "webkitCompassHeading" || event.absolute ? "best-effort-absolute" : "relative-warning";

  if (heading !== null) {
    state.latestHeading = { heading, source, quality };
    els.heading.textContent = `${heading.toFixed(1)}°`;
    els.headingMeta.textContent = `${source} · ${quality}`;
    els.orientation.textContent = source === "alpha-derived" ? "상대값" : "수신 중";
  }
  if (!state.recording) return;
  state.samples.orientation.push({
    t_session_ms: sessionTime(), timestamp_utc: isoNow(), heading_deg: round(heading, 2), source,
    is_absolute: Boolean(event.absolute || source === "webkitCompassHeading"), alpha_deg: round(alpha, 2),
    beta_deg: round(Number(event.beta), 2), gamma_deg: round(Number(event.gamma), 2), screen_rotation_deg: Number(screenAngle || 0), quality
  });
}

function onMotion(event) {
  els.motion.textContent = "수신 중";
  if (!state.recording) return;
  const acc = event.acceleration || {};
  const gravity = event.accelerationIncludingGravity || {};
  const rotation = event.rotationRate || {};
  state.samples.motion.push({
    t_session_ms: sessionTime(), timestamp_utc: isoNow(),
    acceleration_x_ms2: round(Number(acc.x)), acceleration_y_ms2: round(Number(acc.y)), acceleration_z_ms2: round(Number(acc.z)),
    gravity_x_ms2: round(Number(gravity.x)), gravity_y_ms2: round(Number(gravity.y)), gravity_z_ms2: round(Number(gravity.z)),
    rotation_alpha_dps: round(Number(rotation.alpha)), rotation_beta_dps: round(Number(rotation.beta)), rotation_gamma_dps: round(Number(rotation.gamma)),
    interval_ms: round(Number(event.interval), 2)
  });
}

function startLocation() {
  if (!navigator.geolocation) { els.gps.textContent = "미지원"; return; }
  state.locationWatch = navigator.geolocation.watchPosition((position) => {
    const { coords } = position;
    els.gps.textContent = `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
    if (!state.recording) return;
    state.samples.location.push({
      t_session_ms: sessionTime(), timestamp_utc: new Date(position.timestamp).toISOString(), latitude: round(coords.latitude, 7), longitude: round(coords.longitude, 7),
      altitude_m: round(coords.altitude, 2), horizontal_accuracy_m: round(coords.accuracy, 2), altitude_accuracy_m: round(coords.altitudeAccuracy, 2),
      speed_mps: round(coords.speed, 3), course_deg: round(coords.heading, 2)
    });
  }, (error) => {
    els.gps.textContent = "권한/신호 확인";
    showNotice(`GPS: ${error.message}`);
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
}

async function enableCapture() {
  els.enable.disabled = true;
  try {
    await requestMotionPermission();
    await startCamera();
    attachSensors();
    startLocation();
    state.videoMime = selectedMime();
    state.videoExtension = state.videoMime.includes("mp4") ? "mp4" : "webm";
    els.compatibility.textContent = `영상 형식: ${state.videoMime || "MediaRecorder 미지원"}`;
    if (!state.videoMime) throw new Error("이 브라우저에서는 영상 녹화를 지원하지 않습니다.");
    els.status.textContent = "녹화 준비 완료";
    els.panel.hidden = true;
    els.record.disabled = false;
    showNotice("방위각은 기기 나침반의 최선 추정치입니다. 금속·자석 근처에서는 품질이 낮아질 수 있습니다.", 7000);
  } catch (error) {
    els.enable.disabled = false;
    els.compatibility.textContent = `활성화 실패: ${error.message}`;
    els.status.textContent = "권한 필요";
  }
}

function updateTimer() {
  const seconds = Math.floor((performance.now() - state.session.startedPerf) / 1000);
  els.timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function startRecording() {
  state.session = { id: `capture_${new Date().toISOString().replace(/[.:]/g, "-")}`, startedPerf: performance.now(), startedUtc: isoNow() };
  state.chunks = [];
  state.samples = { orientation: [], motion: [], location: [] };
  state.recorder = new MediaRecorder(state.stream, { mimeType: state.videoMime });
  state.recorder.ondataavailable = (event) => { if (event.data.size) state.chunks.push(event.data); };
  state.recorder.onerror = () => showNotice("영상 녹화 중 오류가 발생했습니다. 데이터를 확인하세요.");
  state.recorder.start(1000);
  state.recording = true;
  els.record.classList.add("recording");
  els.record.setAttribute("aria-label", "녹화 중지");
  els.status.textContent = "● 녹화 중";
  els.export.disabled = true;
  state.timerId = window.setInterval(updateTimer, 250);
  updateTimer();
}

function stopRecording() {
  if (!state.recorder || state.recorder.state === "inactive") return;
  state.recording = false;
  state.session.endedUtc = isoNow();
  state.recorder.stop();
  window.clearInterval(state.timerId);
  els.record.classList.remove("recording");
  els.record.setAttribute("aria-label", "녹화 시작");
  els.status.textContent = "저장 준비 완료";
  els.export.disabled = false;
  showNotice(`기록 완료: 방위 ${state.samples.orientation.length}건 · 동작 ${state.samples.motion.length}건 · GPS ${state.samples.location.length}건`, 7000);
}

function toCsv(rows) {
  if (!rows.length) return "";
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [columns.join(","), ...rows.map((row) => columns.map((column) => quote(row[column])).join(","))].join("\r\n");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.style.display = "none";
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadText(text, filename, mime = "text/csv;charset=utf-8") {
  downloadBlob(new Blob(["\ufeff", text], { type: mime }), filename);
}

function exportDataset() {
  if (!state.session) return;
  const base = state.session.id;
  const video = new Blob(state.chunks, { type: state.videoMime });
  const manifest = {
    schema_version: "1.0.0", session: state.session, exported_utc: isoNow(), video: { filename: `${base}.${state.videoExtension}`, mime_type: state.videoMime, bytes: video.size },
    samples: Object.fromEntries(Object.entries(state.samples).map(([name, rows]) => [name, rows.length])),
    latest_heading: state.latestHeading,
    notes: ["Browser sensor data is best-effort.", "heading_deg may be relative when source is alpha-derived.", "GPS course is direction of travel, not camera heading."]
  };
  downloadBlob(video, `${base}.${state.videoExtension}`);
  window.setTimeout(() => downloadText(toCsv(state.samples.orientation), `${base}_orientation.csv`), 250);
  window.setTimeout(() => downloadText(toCsv(state.samples.motion), `${base}_motion.csv`), 500);
  window.setTimeout(() => downloadText(toCsv(state.samples.location), `${base}_gps.csv`), 750);
  window.setTimeout(() => downloadText(JSON.stringify(manifest, null, 2), `${base}_manifest.json`, "application/json;charset=utf-8"), 1000);
  showNotice("영상, CSV 3종, manifest 파일 다운로드를 시작했습니다. Safari 다운로드 목록을 확인하세요.", 7000);
}

els.enable.addEventListener("click", enableCapture);
els.record.addEventListener("click", () => state.recording ? stopRecording() : startRecording());
els.export.addEventListener("click", exportDataset);
els.flip.addEventListener("click", async () => {
  if (state.recording) return showNotice("녹화 중에는 카메라를 전환할 수 없습니다.");
  state.facingMode = state.facingMode === "environment" ? "user" : "environment";
  try { await startCamera(); showNotice(state.facingMode === "environment" ? "후면 카메라" : "전면 카메라"); } catch (error) { showNotice(`카메라 전환 실패: ${error.message}`); }
});

const capabilities = [
  navigator.mediaDevices?.getUserMedia ? "camera" : "camera ✕",
  navigator.geolocation ? "GPS" : "GPS ✕",
  window.DeviceOrientationEvent ? "orientation" : "orientation ✕",
  window.DeviceMotionEvent ? "motion" : "motion ✕",
  window.MediaRecorder ? "recording" : "recording ✕"
];
els.compatibility.textContent = `감지됨: ${capabilities.join(" · ")}`;
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
