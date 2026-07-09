'use strict';

const toastEl = document.getElementById('toast');
const identifyPanel = document.getElementById('identifyPanel');
const runnerView = document.getElementById('runnerView');

let user = null;
let cfg = { pointsPerKm: 10, dailyGoalKm: 5, dailyGoalBonus: 50, pointsPerIls: 25 };

// Run state
let running = false;
let timer = null;
let liveTimer = null;
let startTs = 0;
let samples = [];
let basePos = { lat: 32.0853, lng: 34.7818 }; // ברירת מחדל: תל אביב
let curPos = { ...basePos };
let heading = Math.random() * Math.PI * 2;
let liveRunners = [];

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
  const pct = Math.min(100, (user.kmToday / cfg.dailyGoalKm) * 100);
  document.getElementById('goalBar').style.width = `${pct}%`;
  document.getElementById('goalHint').textContent =
    `${user.kmToday.toFixed(2)} / ${cfg.dailyGoalKm} ק"מ היום` +
    (user.goalReached ? ' · הושג! ✅' : ` · עוד ${(cfg.dailyGoalKm - user.kmToday).toFixed(2)} ק"מ לבונוס ${cfg.dailyGoalBonus} נק'`);
}

async function refreshUser() {
  const res = await fetch(`/api/users/${user.id}`);
  user = (await res.json()).user;
  setPoints(user.points);
  renderGoal();
}

document.getElementById('identifyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('idEmail').value.trim();
  const name = document.getElementById('idName').value.trim();
  if (!email) return;
  const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name }) });
  const data = await res.json();
  if (!res.ok) return showToast(data.error || 'שגיאה', 'err');
  user = data.user;
  localStorage.setItem('runnerId', user.id);
  identifyPanel.style.display = 'none';
  runnerView.style.display = 'block';
  setPoints(user.points);
  renderGoal();
  await loadRaces();
  tryGeolocation();
});

async function loadRaces() {
  const res = await fetch('/api/races');
  const { races } = await res.json();
  const sel = document.getElementById('raceSelect');
  races.forEach((r) => {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = `${r.title} · ${r.distanceKm} ק"מ · ${r.startMode === 'collective' ? 'הזנקה קולקטיבית' : 'חופשי'}`;
    sel.appendChild(o);
  });
}

// נסיון לקבל מיקום אמיתי; אחרת נשתמש בסימולציה
function tryGeolocation() {
  const status = document.getElementById('gpsStatus');
  if (!navigator.geolocation) { status.textContent = 'GPS לא זמין — משתמשים בסימולציה'; return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      basePos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      curPos = { ...basePos };
      status.textContent = '📡 GPS פעיל';
      refreshLive();
    },
    () => { status.textContent = 'אין הרשאת GPS — משתמשים בסימולציה'; refreshLive(); },
    { timeout: 4000 }
  );
}

// ---------- Run loop (סימולציה של GPS + דופק + תדר צעדים) ----------
function startRun() {
  running = true;
  samples = [];
  startTs = Date.now();
  curPos = { ...basePos };
  document.getElementById('startBtn').style.display = 'none';
  document.getElementById('stopBtn').style.display = 'inline-block';
  document.getElementById('verdictBox').innerHTML = '';
  const cheat = document.getElementById('cheatToggle').checked;

  timer = setInterval(() => {
    const elapsed = (Date.now() - startTs) / 1000;
    // תנועה: רץ סביר ~ 11 קמ"ש. במצב רמאות "נוסע" ~ 60 קמ"ש
    const speedKmh = cheat ? 60 : 10 + Math.sin(elapsed / 8) * 2;
    const stepM = (speedKmh * 1000 / 3600) * 1; // מרחק לשנייה
    heading += (Math.random() - 0.5) * 0.3;
    // המרה גסה של מטרים למעלות
    curPos = {
      lat: curPos.lat + (stepM * Math.cos(heading)) / 111000,
      lng: curPos.lng + (stepM * Math.sin(heading)) / (111000 * Math.cos(curPos.lat * Math.PI / 180)),
    };
    const sample = { t: Math.round(elapsed), lat: curPos.lat, lng: curPos.lng };
    if (cheat) {
      // רמאות: אין דופק/תדר צעדים אמיתיים
      sample.hr = 0;
      sample.cadence = 0;
    } else {
      sample.hr = Math.round(150 + Math.sin(elapsed / 10) * 12 + (Math.random() - 0.5) * 4);
      sample.cadence = Math.round(168 + Math.sin(elapsed / 6) * 6 + (Math.random() - 0.5) * 4);
    }
    samples.push(sample);
    updateLiveStats(elapsed);
  }, 1000);

  liveTimer = setInterval(refreshLive, 3000);
  refreshLive();
  showToast('הריצה התחילה! בהצלחה 🏃', 'ok');
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
}

async function stopRun() {
  running = false;
  clearInterval(timer);
  clearInterval(liveTimer);
  document.getElementById('startBtn').style.display = 'inline-block';
  document.getElementById('stopBtn').style.display = 'none';

  const raceId = document.getElementById('raceSelect').value || null;
  const res = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, raceId, samples }) });
  const data = await res.json();
  if (!res.ok) return showToast(data.error || 'שגיאה', 'err');

  const v = data.verdict;
  const box = document.getElementById('verdictBox');
  if (v.verified) {
    box.innerHTML = `<div class="verdict ok">✅ הריצה אומתה! ${v.distanceKm} ק"מ · דופק ממוצע ${v.avgHr} · תדר ${v.avgCadence}<br>הרווחת <b>${data.pointsEarned}</b> נקודות${data.dailyBonus ? ` (כולל בונוס יעד יומי ${data.dailyBonus})` : ''}.</div>`;
    showToast(`+${data.pointsEarned} נקודות! 🎉`, 'ok');
  } else {
    const reasons = { not_enough_gps: 'אין מספיק נתוני GPS', missing_heart_rate: 'חסר מדידת דופק', missing_cadence: 'חסר תדר צעדים', speed_too_high: 'מהירות גבוהה מדי (חשד לרכב)', gps_jump: 'קפיצת GPS חריגה', cadence_pace_mismatch: 'תדר צעדים לא תואם לקצב', implausible_heart_rate: 'דופק לא סביר' };
    box.innerHTML = `<div class="verdict bad">🚫 הריצה נחסמה על ידי מנגנון האנטי-רמאות. לא זוכתה בנקודות.<ul>${v.flags.map((f) => `<li>${reasons[f] || f}</li>`).join('')}</ul></div>`;
    showToast('הריצה נחסמה (חשד לרמאות)', 'err');
  }
  await refreshUser();
  refreshLive();
}

document.getElementById('startBtn').addEventListener('click', startRun);
document.getElementById('stopBtn').addEventListener('click', stopRun);

// ---------- Live map ----------
async function refreshLive() {
  const raceId = document.getElementById('raceSelect') ? document.getElementById('raceSelect').value : '';
  try {
    const res = await fetch(`/api/live?lat=${curPos.lat}&lng=${curPos.lng}${raceId ? '&raceId=' + raceId : ''}`);
    const data = await res.json();
    liveRunners = data.runners.filter((r) => !(r.lastPos && r.lat === curPos.lat)); // avoid dup self
    drawMap();
  } catch (e) { drawMap(); }
}

function drawMap() {
  const c = document.getElementById('liveMap');
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height, cx = W / 2, cy = H / 2;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 0, W, H);

  // grid rings
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let r = 60; r <= 220; r += 60) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(225,29,42,0.25)';
  ctx.beginPath(); ctx.moveTo(cx, 20); ctx.lineTo(cx, H - 20); ctx.moveTo(20, cy); ctx.lineTo(W - 20, cy); ctx.stroke();

  // scale: ~1.5km radius -> 220px
  const scale = 220 / 0.015; // degrees to px (rough)
  liveRunners.forEach((r) => {
    const dx = (r.lng - curPos.lng) * scale * Math.cos(curPos.lat * Math.PI / 180);
    const dy = -(r.lat - curPos.lat) * scale;
    let x = cx + dx, y = cy + dy;
    x = Math.max(24, Math.min(W - 24, x));
    y = Math.max(24, Math.min(H - 24, y));
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = r.inRace ? '#ffffff' : '#a1a1aa';
    ctx.fill();
    ctx.fillStyle = '#e6e6e9';
    ctx.font = '12px Heebo, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${r.name} · ${r.distanceKm}ק"מ`, x, y - 12);
  });

  // me (center)
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#e11d2a';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px Heebo, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('אני', cx, cy - 16);
}

async function init() {
  try { cfg = await (await fetch('/api/config')).json(); } catch (e) { /* default */ }
  const savedId = localStorage.getItem('runnerId');
  if (savedId) {
    try {
      const res = await fetch(`/api/users/${savedId}`);
      if (res.ok) {
        user = (await res.json()).user;
        identifyPanel.style.display = 'none';
        runnerView.style.display = 'block';
        setPoints(user.points);
        renderGoal();
        await loadRaces();
        tryGeolocation();
        drawMap();
        return;
      }
    } catch (e) { /* fall through to identify */ }
  }
  drawMap();
}
init();
