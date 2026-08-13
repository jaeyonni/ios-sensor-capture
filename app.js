const $ = (id) => document.getElementById(id);
const els = {
  preview: $("preview"), status: $("capture-status"), heading: $("heading"), headingMeta: $("heading-meta"),
  gps: $("gps-readout"), orientation: $("orientation-readout"), motion: $("motion-readout"),
  panel: $("permission-panel"), enable: $("enable-button"), record: $("record-button"), export: $("export-button"),
  timer: $("timer"), notice: $("notice"), flip: $("flip-camera"), compatibility: $("compatibility")
};

const state = {
  facingMode: "environment", stream: null, recorder: null, chunks: [], videoMime: "", videoExtension: "webm",
  locationWatch: null, session: null, recording: false, recordingError: false, videoReady: false, timerId: null, latestHeading: null, absoluteHeadingSeen: false,
  samples: { orientation: [], motion: [], location: [] }, listenersAdded: false
};

const normalizeDegrees = (value) => ((value % 360) + 360) % 360;
const round = (value, digits = 4) => Number.isFinite(value) ? Number(value.toFixed(digits)) : "";
const sessionTime = () => state.session ? round(performance.now() - state.session.startedPerf, 3) : "";
const isoNow = () => new Date().toISOString();

function tiltCompensatedHeading(alpha, beta, gamma) {
  if (![alpha, beta, gamma].every(Number.isFinite)) return null;
  if (Math.abs(beta) < 0.001 && Math.abs(gamma) < 0.001) return normalizeDegrees(360 - alpha);
  const radians = Math.PI / 180;
  const x = beta * radians;
  const y = gamma * radians;
  const z = alpha * radians;
  const vx = -Math.cos(z) * Math.sin(y) - Math.sin(z) * Math.sin(x) * Math.cos(y);
  const vy = -Math.sin(z) * Math.sin(y) + Math.cos(z) * Math.sin(x) * Math.cos(y);
  return normalizeDegrees(Math.atan2(vx, vy) / radians);
}

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
  const hasAppleCompass = Number.isFinite(appleHeading) && appleHeading >= 0;
  const isAbsolute = hasAppleCompass || event.type === "deviceorientationabsolute" || event.absolute === true;

  if (isAbsolute) state.absoluteHeadingSeen = true;
  if (!isAbsolute && state.absoluteHeadingSeen) return;

  // Android absolute alpha is already world-referenced. Adding the screen angle here
  // incorrectly makes portrait/landscape starts look like 0° or 90°.
  const heading = hasAppleCompass ? normalizeDegrees(appleHeading)
    : isAbsolute ? tiltCompensatedHeading(alpha, Number(event.beta), Number(event.gamma)) : null;
  const source = hasAppleCompass ? "webkitCompassHeading"
    : isAbsolute ? "deviceorientationabsolute" : "deviceorientation-relative";
  const quality = isAbsolute ? "best-effort-absolute" : "relative-warning";
  const headingFormula = hasAppleCompass ? "webkitCompassHeading" : isAbsolute ? "w3c-tilt-compensated" : "not-calculated";

  if (heading !== null) {
    state.latestHeading = { heading, source, quality };
    els.heading.textContent = `${heading.toFixed(1)}°`;
    els.headingMeta.textContent = `${source} · ${quality}`;
    els.orientation.textContent = "수신 중";
  } else {
    els.heading.textContent = "—°";
    els.headingMeta.textContent = "절대 방위 미지원 · 상대값은 CSV에만 기록";
    els.orientation.textContent = "상대값";
  }
  if (!state.recording) return;
  state.samples.orientation.push({
    t_session_ms: sessionTime(), timestamp_utc: isoNow(), heading_deg: round(heading, 2), source, heading_formula: headingFormula, event_type: event.type,
    is_absolute: isAbsolute, alpha_deg: round(alpha, 2),
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

function clearRecordingTimer() {
  if (state.timerId !== null) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function resetRecordingUi(status = "녹화 준비 완료") {
  state.recording = false;
  clearRecordingTimer();
  els.record.classList.remove("recording");
  els.record.setAttribute("aria-label", "녹화 시작");
  els.status.textContent = status;
}

function handleRecordingError(error) {
  state.recordingError = true;
  state.videoReady = false;
  els.export.disabled = true;
  resetRecordingUi("녹화 오류");
  const detail = error?.message ? `: ${error.message}` : "";
  showNotice(`영상 녹화 중 오류가 발생했습니다${detail}. 다시 시도해 주세요.`, 7000);
  if (state.recorder && state.recorder.state !== "inactive") {
    try { state.recorder.stop(); } catch { /* already stopped */ }
  }
}

function stopLocation() {
  if (state.locationWatch !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(state.locationWatch);
    state.locationWatch = null;
  }
}

function startLocation() {
  if (!navigator.geolocation) { els.gps.textContent = "미지원"; return; }
  stopLocation();
  state.locationWatch = navigator.geolocation.watchPosition((position) => {
    const { coords } = position;
    els.gps.textContent = `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
    if (!state.recording) return;
    const positionTime = Number(position.timestamp);
    state.samples.location.push({
      t_session_ms: sessionTime(), timestamp_utc: Number.isFinite(positionTime) && positionTime > 0 ? new Date(positionTime).toISOString() : isoNow(), latitude: round(coords.latitude, 7), longitude: round(coords.longitude, 7),
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
    stopLocation();
    state.stream?.getTracks().forEach((track) => track.stop());
    state.stream = null;
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
  state.recordingError = false;
  state.videoReady = false;
  state.latestHeading = null;
  state.absoluteHeadingSeen = false;
  state.samples = { orientation: [], motion: [], location: [] };
  try {
    state.recorder = new MediaRecorder(state.stream, { mimeType: state.videoMime });
    state.recorder.ondataavailable = (event) => { if (event.data.size) state.chunks.push(event.data); };
    state.recorder.onstop = () => {
      clearRecordingTimer();
      if (state.recordingError) return;
      state.videoReady = state.chunks.length > 0;
      els.status.textContent = state.videoReady ? "저장 준비 완료" : "저장 실패";
      els.export.disabled = !state.videoReady;
      showNotice(state.videoReady
        ? `기록 완료: 방위 ${state.samples.orientation.length}건 · 동작 ${state.samples.motion.length}건 · GPS ${state.samples.location.length}건`
        : "영상 데이터가 없어 다운로드할 수 없습니다.", 7000);
    };
    state.recorder.onerror = (event) => handleRecordingError(event.error);
    state.recorder.start(1000);
    state.recording = true;
    els.record.classList.add("recording");
    els.record.setAttribute("aria-label", "녹화 중지");
    els.status.textContent = "● 녹화 중";
    els.export.disabled = true;
    state.timerId = window.setInterval(updateTimer, 250);
    updateTimer();
  } catch (error) {
    handleRecordingError(error);
  }
}

function stopRecording() {
  if (!state.recorder || state.recorder.state === "inactive") return;
  state.recording = false;
  state.videoReady = false;
  state.session.endedUtc = isoNow();
  state.recorder.stop();
  clearRecordingTimer();
  els.record.classList.remove("recording");
  els.record.setAttribute("aria-label", "녹화 시작");
  els.status.textContent = "영상 저장 중";
  showNotice("영상 파일을 마무리하는 중입니다. 잠시 기다려 주세요.", 7000);
}

const csvColumns = {
  orientation: [
    "t_session_ms", "timestamp_utc", "heading_deg", "source", "heading_formula", "event_type", "is_absolute",
    "alpha_deg", "beta_deg", "gamma_deg", "screen_rotation_deg", "quality"
  ],
  motion: [
    "t_session_ms", "timestamp_utc", "acceleration_x_ms2", "acceleration_y_ms2", "acceleration_z_ms2",
    "gravity_x_ms2", "gravity_y_ms2", "gravity_z_ms2", "rotation_alpha_dps", "rotation_beta_dps",
    "rotation_gamma_dps", "interval_ms"
  ],
  gps: [
    "t_session_ms", "timestamp_utc", "latitude", "longitude", "altitude_m", "horizontal_accuracy_m",
    "altitude_accuracy_m", "speed_mps", "course_deg"
  ]
};

function toCsv(rows, preferredColumns = []) {
  const columns = preferredColumns.length ? preferredColumns : [...new Set(rows.flatMap((row) => Object.keys(row)))];
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

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipHeader(size, nameLength, signature) {
  const header = new Uint8Array(size);
  const view = new DataView(header.buffer);
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  view.setUint32(0, signature, true);
  view.setUint16(4, 20, true);
  if (signature === 0x04034b50) {
    view.setUint16(6, 0x0800, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, dosTime, true);
    view.setUint16(12, dosDate, true);
    view.setUint32(14, 0, true);
    view.setUint32(18, 0, true);
    view.setUint32(22, 0, true);
    view.setUint16(26, nameLength, true);
  } else {
    view.setUint16(6, 0x14, true);
    view.setUint16(8, 0x0800, true);
    view.setUint16(12, dosTime, true);
    view.setUint16(14, dosDate, true);
    view.setUint16(28, nameLength, true);
  }
  return header;
}

async function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = file.data instanceof Uint8Array ? file.data : encoder.encode(file.data);
    const checksum = crc32(data);
    const local = zipHeader(30, name.length, 0x04034b50);
    const localView = new DataView(local.buffer);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localParts.push(concatBytes([local, name, data]));

    const central = zipHeader(46, name.length, 0x02014b50);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint32(42, offset, true);
    centralParts.push(concatBytes([central, name]));
    offset += local.length + name.length + data.length;
  }
  const centralDirectory = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, offset, true);
  return new Blob([...localParts, centralDirectory, end], { type: "application/zip" });
}

async function exportDataset() {
  if (!state.session || !state.videoReady) {
    showNotice("영상 저장이 끝난 뒤 다운로드 버튼을 눌러 주세요.");
    return;
  }
  const base = state.session.id;
  const video = new Blob(state.chunks, { type: state.videoMime });
  const manifest = {
    schema_version: "2.0.0", session: state.session, exported_utc: isoNow(), video: { filename: `${base}.${state.videoExtension}`, mime_type: state.videoMime, bytes: video.size },
    csv_files: {
      orientation: { filename: `${base}_orientation.csv`, rows: state.samples.orientation.length, columns: csvColumns.orientation },
      motion: { filename: `${base}_motion.csv`, rows: state.samples.motion.length, columns: csvColumns.motion },
      gps: { filename: `${base}_gps.csv`, rows: state.samples.location.length, columns: csvColumns.gps }
    },
    latest_heading: state.latestHeading,
    notes: ["Browser sensor data is best-effort.", "heading_deg is blank when only relative orientation is available.", "GPS course is direction of travel, not camera heading."]
  };
  const encoder = new TextEncoder();
  const zip = await createZip([
    { name: `${base}.${state.videoExtension}`, data: new Uint8Array(await video.arrayBuffer()) },
    { name: `${base}_orientation.csv`, data: encoder.encode(`\ufeff${toCsv(state.samples.orientation, csvColumns.orientation)}`) },
    { name: `${base}_motion.csv`, data: encoder.encode(`\ufeff${toCsv(state.samples.motion, csvColumns.motion)}`) },
    { name: `${base}_gps.csv`, data: encoder.encode(`\ufeff${toCsv(state.samples.location, csvColumns.gps)}`) },
    { name: `${base}_manifest.json`, data: encoder.encode(JSON.stringify(manifest, null, 2)) }
  ]);
  downloadBlob(zip, `${base}.zip`);
  showNotice("영상·방위·동작·GPS 결과를 하나의 ZIP 파일로 다운로드했습니다. 파일 앱의 다운로드 폴더를 확인하세요.", 7000);
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
window.addEventListener("pagehide", () => {
  stopLocation();
  state.stream?.getTracks().forEach((track) => track.stop());
});
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js?v=7", { updateViaCache: "none" }));
