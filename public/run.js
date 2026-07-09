'use strict';

const { t, deviceName } = window.i18n;

const toastEl = document.getElementById('toast');
const identifyPanel = document.getElementById('identifyPanel');
const runnerView = document.getElementById('runnerView');

let user = null;
let cfg = { pointsPerKm: 10, dailyGoalKm: 5, dailyGoalBonus: 50, pointsPerIls: 25, integrations: {} };
let selectedDevice = 'phone';
let deviceSimulated = true;

// Run state
let running = false;
let timer = null;
let startTs = 0;
let samples = [];
let basePos = { lat: 32.0853, lng: 34.7818 }; // ברירת מחדל: תל אביב
let curPos = { ...basePos };
let heading = Math.random() * Math.PI * 2;

// Map state
let map = null;
let routeLine = null;
let startMarker = null;
let curMarker = null;

function showToast(msg, type = 'ok') {
  toastEl.textContent = msg;
  toastEl.className = `toast show ${type}`;
  setTimeout(() => { toastEl.className = 'toast'; }, 3400);
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function setPoints(p) {
  document.getElementById('pointsVal').textContent = p;
  document.getElementById('pointsVal2').textContent = p;
  document.getElementById('pointsChip').style.display = 'inline-flex';
}

function renderGoal() {
  if (!user) return;
  const pct = Math.min(100, (user.kmToday / cfg.dailyGoalKm) * 100);
  document.getElementById('goalBar').style.width = `${pct}%`;
  const base = t('run.goal.today', { done: user.kmToday.toFixed(2), goal: cfg.dailyGoalKm });
  const extra = user.goalReached
    ? t('run.goal.reached')
    : t('run.goal.remaining', { r: (cfg.dailyGoalKm - user.kmToday).toFixed(2), b: cfg.dailyGoalBonus });
  document.getElementById('goalHint').textContent = base + extra;
}

async function refreshUser() {
  const res = await fetch(`/api/users/${user.id}`);
  user = (await res.json()).user;
  setPoints(user.points);
  renderGoal();
}

// ---------- Device connect ----------
function renderDeviceStates() {
  const ints = cfg.integrations || {};
  document.querySelectorAll('.device-opt').forEach((el) => {
    const id = el.dataset.device;
    const info = ints[id];
    const stateEl = el.querySelector('[data-state]');
    if (stateEl) stateEl.textContent = info && info.configured && id !== 'phone' ? '●' : '';
    el.classList.toggle('active', id === selectedDevice);
  });
}

async function connectDevice(provider) {
  try {
    const res = await fetch(`/api/integrations/${provider}/connect`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'error');
    selectedDevice = provider;
    deviceSimulated = data.simulated;
    renderDeviceStates();
    const note = document.getElementById('deviceNote');
    note.style.display = 'block';
    note.textContent = t('run.dev.connected', { device: deviceName(provider) }) + (data.simulated ? ' ' + t('run.dev.simmode') : '');
  } catch (e) { showToast(t('toast.err'), 'err'); }
}

document.getElementById('deviceGrid').addEventListener('click', (e) => {
  const opt = e.target.closest('.device-opt');
  if (opt) connectDevice(opt.dataset.device);
});

// ---------- Identify ----------
document.getElementById('identifyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('idEmail').value.trim();
  const name = document.getElementById('idName').value.trim();
  if (!email) return;
  const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name }) });
  const data = await res.json();
  if (!res.ok) return showToast(data.error || t('toast.err'), 'err');
  await enterRunner(data.user);
});

async function enterRunner(u) {
  user = u;
  localStorage.setItem('runnerId', user.id);
  identifyPanel.style.display = 'none';
  runnerView.style.display = 'block';
  setPoints(user.points);
  renderGoal();
  renderDeviceStates();
  await loadRaces();
  initMap();
  tryGeolocation();
}

async function loadRaces() {
  const res = await fetch('/api/races');
  const { races } = await res.json();
  const sel = document.getElementById('raceSelect');
  races.forEach((r) => {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = `${r.title} · ${r.distanceKm} ${t('run.stat.dist')}`;
    sel.appendChild(o);
  });
}

function tryGeolocation() {
  const status = document.getElementById('gpsStatus');
  if (!navigator.geolocation) { status.textContent = t('run.gps.sim'); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      basePos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      curPos = { ...basePos };
      status.textContent = t('run.gps.active');
      recenterMap();
    },
    () => { status.textContent = t('run.gps.noperm'); },
    { timeout: 4000 }
  );
}

// ---------- Map ----------
function initMap() {
  if (map) { setTimeout(() => map.invalidateSize(), 150); return; }
  map = L.map('routeMap', { zoomControl: true }).setView([basePos.lat, basePos.lng], 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap © CARTO',
  }).addTo(map);
  routeLine = L.polyline([], { color: '#e11d2a', weight: 5, opacity: 0.9 }).addTo(map);
  setTimeout(() => map.invalidateSize(), 200);
}

function recenterMap() { if (map) map.setView([curPos.lat, curPos.lng], 15); }

function updateMap() {
  if (!map) return;
  const pts = samples.filter((s) => typeof s.lat === 'number').map((s) => [s.lat, s.lng]);
  if (!pts.length) return;
  routeLine.setLatLngs(pts);
  const start = pts[0];
  const cur = pts[pts.length - 1];
  if (!startMarker) {
    startMarker = L.circleMarker(start, { radius: 7, color: '#fff', fillColor: '#16a34a', fillOpacity: 1, weight: 2 }).addTo(map);
  } else startMarker.setLatLng(start);
  if (!curMarker) {
    curMarker = L.circleMarker(cur, { radius: 8, color: '#fff', fillColor: '#e11d2a', fillOpacity: 1, weight: 3 }).addTo(map);
  } else curMarker.setLatLng(cur);
  if (pts.length > 1) map.fitBounds(routeLine.getBounds(), { padding: [40, 40], maxZoom: 17 });
  else map.setView(cur, 16);
}

// ---------- Run loop (טלמטריה מהמכשיר; מדומה בסביבה ללא חיישנים אמיתיים) ----------
function startRun() {
  running = true;
  samples = [];
  startTs = Date.now();
  curPos = { ...basePos };
  if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
  if (curMarker) { map.removeLayer(curMarker); curMarker = null; }
  if (routeLine) routeLine.setLatLngs([]);
  document.getElementById('startBtn').style.display = 'none';
  document.getElementById('stopBtn').style.display = 'inline-block';
  document.getElementById('verdictBox').innerHTML = '';
  const cheat = document.getElementById('cheatToggle').checked;

  timer = setInterval(() => {
    const elapsed = (Date.now() - startTs) / 1000;
    const speedKmh = cheat ? 60 : 10 + Math.sin(elapsed / 8) * 2;
    const stepM = (speedKmh * 1000 / 3600) * 1;
    heading += (Math.random() - 0.5) * 0.3;
    curPos = {
      lat: curPos.lat + (stepM * Math.cos(heading)) / 111000,
      lng: curPos.lng + (stepM * Math.sin(heading)) / (111000 * Math.cos(curPos.lat * Math.PI / 180)),
    };
    const sample = { t: Math.round(elapsed), lat: curPos.lat, lng: curPos.lng };
    if (cheat) { sample.hr = 0; sample.cadence = 0; }
    else {
      sample.hr = Math.round(150 + Math.sin(elapsed / 10) * 12 + (Math.random() - 0.5) * 4);
      sample.cadence = Math.round(168 + Math.sin(elapsed / 6) * 6 + (Math.random() - 0.5) * 4);
    }
    samples.push(sample);
    updateLiveStats(elapsed);
    updateMap();
  }, 1000);

  showToast(t('run.toast.start'), 'ok');
}

function haversineKm(a, b) {
  const R = 6371, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function updateLiveStats(elapsed) {
  let dist = 0;
  for (let i = 1; i < samples.length; i++) dist += haversineKm(samples[i - 1], samples[i]);
  const last = samples[samples.length - 1] || {};
  document.getElementById('stDist').textContent = dist.toFixed(2);
  document.getElementById('stTime').textContent = fmtTime(elapsed);
  const pace = dist > 0 ? (elapsed / 60) / dist : 0;
  document.getElementById('stPace').textContent = pace > 0 ? fmtTime(pace * 60) : '—';
  document.getElementById('stHr').textContent = last.hr ? last.hr : '—';
  document.getElementById('stCad').textContent = last.cadence ? last.cadence : '—';
  document.getElementById('stCal').textContent = Math.round(dist * 70); // ~70 קק"ל לק"מ
}

async function stopRun() {
  running = false;
  clearInterval(timer);
  document.getElementById('startBtn').style.display = 'inline-block';
  document.getElementById('stopBtn').style.display = 'none';

  const raceId = document.getElementById('raceSelect').value || null;
  const res = await fetch('/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: user.id, raceId, device: selectedDevice, samples }),
  });
  const data = await res.json();
  if (!res.ok) return showToast(data.error || t('toast.err'), 'err');

  const v = data.verdict;
  const box = document.getElementById('verdictBox');
  if (v.verified) {
    const bonus = data.dailyBonus ? t('run.verdict.bonus', { b: data.dailyBonus }) : '';
    box.innerHTML = `<div class="verdict ok">${t('run.verdict.ok', { km: v.distanceKm, hr: v.avgHr, cad: v.avgCadence })}<br>${t('run.verdict.earned', { pts: data.pointsEarned, bonus })}</div>`;
    showToast(t('run.toast.points', { n: data.pointsEarned }), 'ok');
  } else {
    box.innerHTML = `<div class="verdict bad">${t('run.verdict.blocked')}<ul>${v.flags.map((f) => `<li>${t('reasons.' + f)}</li>`).join('')}</ul></div>`;
    showToast(t('run.toast.blocked'), 'err');
  }
  await refreshUser();
}

document.getElementById('startBtn').addEventListener('click', startRun);
document.getElementById('stopBtn').addEventListener('click', stopRun);

// ---------- Init ----------
async function init() {
  try { cfg = await (await fetch('/api/config')).json(); } catch (e) { /* default */ }
  window.i18n.initI18n(() => { renderGoal(); renderDeviceStates(); });
  const savedId = localStorage.getItem('runnerId');
  if (savedId) {
    try {
      const res = await fetch(`/api/users/${savedId}`);
      if (res.ok) { await enterRunner((await res.json()).user); return; }
    } catch (e) { /* fall through */ }
  }
  renderDeviceStates();
}
init();
