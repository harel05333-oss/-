'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
// סיסמת מנהל - ניתן להגדיר דרך משתנה סביבה ADMIN_KEY
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123';

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// --- כללי נקודות ותמחור ---
const POINTS_PER_KM = 10; // נקודות לכל ק"מ ריצה מאומתת
const DAILY_GOAL_KM = 5; // יעד יומי (ק"מ)
const DAILY_GOAL_BONUS = 50; // בונוס נקודות על עמידה ביעד היומי
const POINTS_PER_ILS = 25; // 25 נקודות = ₪1 הנחה (מכוון שקשה מאוד להגיע לחינם)

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- אחסון ----------
function emptyDb() {
  return { races: [], users: [], runs: [], discounts: [] };
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(emptyDb(), null, 2));
}

function readDb() {
  ensureStore();
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  return { ...emptyDb(), ...db };
}

function writeDb(db) {
  ensureStore();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function requireAdmin(req, res, next) {
  if (req.get('x-admin-key') !== ADMIN_KEY) return res.status(401).json({ error: 'סיסמת מנהל שגויה' });
  next();
}

// ---------- עזרי מרחק / אנטי-רמאות ----------
function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// בדיקת אמינות ריצה: חייבים דופק + תדר צעדים + מיקום, ובדיקת סבירות מהירות
function validateRun(samples) {
  const flags = [];
  const gps = (samples || []).filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number');
  if (gps.length < 2) {
    return { verified: false, distanceKm: 0, durationSec: 0, avgSpeedKmh: 0, avgHr: 0, avgCadence: 0, flags: ['not_enough_gps'] };
  }

  let distanceKm = 0;
  let maxSegSpeed = 0;
  for (let i = 1; i < gps.length; i++) {
    const segKm = haversineKm(gps[i - 1], gps[i]);
    const dt = Math.max(1, (gps[i].t - gps[i - 1].t)) / 3600; // שעות
    const segSpeed = segKm / dt;
    if (segSpeed > maxSegSpeed) maxSegSpeed = segSpeed;
    distanceKm += segKm;
  }
  const durationSec = Math.max(1, gps[gps.length - 1].t - gps[0].t);
  const avgSpeedKmh = distanceKm / (durationSec / 3600);

  const hrs = samples.map((s) => s.hr).filter((v) => typeof v === 'number' && v > 0);
  const cadences = samples.map((s) => s.cadence).filter((v) => typeof v === 'number' && v > 0);
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const avgHr = Math.round(avg(hrs));
  const avgCadence = Math.round(avg(cadences));

  // חייבים את שלושת אמצעי המדידה
  if (hrs.length < gps.length * 0.8) flags.push('missing_heart_rate');
  if (cadences.length < gps.length * 0.8) flags.push('missing_cadence');

  // סבירות מהירות (הליכה/ריצה אנושית)
  if (avgSpeedKmh > 25) flags.push('speed_too_high'); // כנראה רכב
  if (maxSegSpeed > 45) flags.push('gps_jump');

  // חוסר התאמה בין קצב לתדר צעדים (רץ מהר אך אין צעדים = נסיעה)
  if (avgSpeedKmh > 6 && avgCadence > 0 && avgCadence < 120) flags.push('cadence_pace_mismatch');

  // דופק "שטוח" לגמרי בזמן מאמץ = חשד לזיוף
  if (hrs.length > 3) {
    const hrSpread = Math.max(...hrs) - Math.min(...hrs);
    if (avgSpeedKmh > 6 && hrSpread < 2) flags.push('implausible_heart_rate');
    if (avgHr > 220 || avgHr < 40) flags.push('implausible_heart_rate');
  }

  return {
    verified: flags.length === 0,
    distanceKm: Number(distanceKm.toFixed(3)),
    durationSec,
    avgSpeedKmh: Number(avgSpeedKmh.toFixed(2)),
    avgHr,
    avgCadence,
    flags,
  };
}

function todayStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

// ================= API =================

// אימות סיסמת מנהל
app.post('/api/admin/verify', (req, res) => {
  res.json({ ok: (req.body || {}).key === ADMIN_KEY });
});

// ---------- משתמשים / נקודות ----------
// יצירה או שליפה לפי אימייל (זהות פשוטה)
app.post('/api/users', (req, res) => {
  const { name, email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'אימייל נדרש' });
  const db = readDb();
  let user = db.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user) {
    user = { id: crypto.randomUUID(), name: name || '', email: String(email).trim(), points: 0, createdAt: new Date().toISOString() };
    db.users.push(user);
    writeDb(db);
  } else if (name && !user.name) {
    user.name = name;
    writeDb(db);
  }
  res.json({ user: publicUser(db, user) });
});

app.get('/api/users/:id', (req, res) => {
  const db = readDb();
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'משתמש לא נמצא' });
  res.json({ user: publicUser(db, user) });
});

function publicUser(db, user) {
  const runsToday = db.runs.filter((r) => r.userId === user.id && r.date === todayStr() && r.verified);
  const kmToday = runsToday.reduce((a, r) => a + r.distanceKm, 0);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    points: user.points,
    dailyGoalKm: DAILY_GOAL_KM,
    kmToday: Number(kmToday.toFixed(2)),
    goalReached: kmToday >= DAILY_GOAL_KM,
    ilsOffAvailable: Number((user.points / POINTS_PER_ILS).toFixed(2)),
  };
}

// ---------- מרוצים ----------
app.get('/api/races', (req, res) => {
  const { races } = readDb();
  const publicRaces = races
    .map((r) => ({
      id: r.id,
      title: r.title,
      date: r.date,
      time: r.time,
      location: r.location,
      distanceKm: r.distanceKm,
      description: r.description,
      howToJoin: r.howToJoin,
      capacity: r.capacity,
      price: r.price,
      prizes: r.prizes,
      startMode: r.startMode,
      registeredCount: Array.isArray(r.registrations) ? r.registrations.length : 0,
    }))
    .sort((a, b) => new Date(`${a.date}T${a.time || '00:00'}`) - new Date(`${b.date}T${b.time || '00:00'}`));
  res.json({ races: publicRaces });
});

app.post('/api/races', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.date || b.distanceKm === undefined || b.distanceKm === null || b.distanceKm === '') {
    return res.status(400).json({ error: 'שם המרוץ, תאריך ומרחק (ק"מ) הם שדות חובה' });
  }
  const db = readDb();
  const race = {
    id: crypto.randomUUID(),
    title: String(b.title).trim(),
    date: b.date,
    time: b.time || '',
    location: b.location || '',
    distanceKm: Number(b.distanceKm),
    description: b.description || '',
    howToJoin: b.howToJoin || '',
    capacity: b.capacity ? Number(b.capacity) : null,
    price: b.price ? Number(b.price) : 0,
    prizes: {
      first: (b.prizes && b.prizes.first) || '',
      second: (b.prizes && b.prizes.second) || '',
      third: (b.prizes && b.prizes.third) || '',
    },
    startMode: b.startMode === 'anytime' ? 'anytime' : 'collective',
    createdAt: new Date().toISOString(),
    registrations: [],
  };
  db.races.push(race);
  writeDb(db);
  res.status(201).json({ race });
});

app.delete('/api/races/:id', requireAdmin, (req, res) => {
  const db = readDb();
  const before = db.races.length;
  db.races = db.races.filter((r) => r.id !== req.params.id);
  if (db.races.length === before) return res.status(404).json({ error: 'מרוץ לא נמצא' });
  writeDb(db);
  res.json({ ok: true });
});

app.get('/api/races/:id/registrations', requireAdmin, (req, res) => {
  const db = readDb();
  const race = db.races.find((r) => r.id === req.params.id);
  if (!race) return res.status(404).json({ error: 'מרוץ לא נמצא' });
  res.json({ race: { id: race.id, title: race.title }, registrations: race.registrations });
});

// ---------- קודי הנחה ----------
app.get('/api/discounts', requireAdmin, (req, res) => {
  res.json({ discounts: readDb().discounts });
});

app.post('/api/discounts', requireAdmin, (req, res) => {
  const { code, percent } = req.body || {};
  const p = Number(percent);
  if (!code || !Number.isFinite(p) || p <= 0 || p > 100) {
    return res.status(400).json({ error: 'קוד ואחוז הנחה (1-100) נדרשים' });
  }
  const db = readDb();
  const codeUp = String(code).trim().toUpperCase();
  if (db.discounts.some((d) => d.code === codeUp)) return res.status(409).json({ error: 'הקוד כבר קיים' });
  const discount = { id: crypto.randomUUID(), code: codeUp, percent: p, createdAt: new Date().toISOString() };
  db.discounts.push(discount);
  writeDb(db);
  res.status(201).json({ discount });
});

app.delete('/api/discounts/:id', requireAdmin, (req, res) => {
  const db = readDb();
  const before = db.discounts.length;
  db.discounts = db.discounts.filter((d) => d.id !== req.params.id);
  if (db.discounts.length === before) return res.status(404).json({ error: 'קוד לא נמצא' });
  writeDb(db);
  res.json({ ok: true });
});

// אימות קוד הנחה (ציבורי, לשימוש בקופה)
app.post('/api/discounts/validate', (req, res) => {
  const code = String((req.body || {}).code || '').trim().toUpperCase();
  const disc = readDb().discounts.find((d) => d.code === code);
  if (!disc) return res.json({ valid: false });
  res.json({ valid: true, code: disc.code, percent: disc.percent });
});

// חישוב מחיר סופי (הנחה + נקודות)
function computePrice(race, discount, pointsToUse, user) {
  const base = race.price || 0;
  let price = base;
  const breakdown = { base, discountPercent: 0, discountAmount: 0, pointsUsed: 0, pointsAmount: 0, final: base };
  if (discount) {
    breakdown.discountPercent = discount.percent;
    breakdown.discountAmount = Number(((base * discount.percent) / 100).toFixed(2));
    price -= breakdown.discountAmount;
  }
  if (pointsToUse > 0 && user) {
    const usable = Math.min(pointsToUse, user.points);
    const maxIls = usable / POINTS_PER_ILS;
    const ilsOff = Math.min(maxIls, price); // לא יורדים מתחת ל-0
    breakdown.pointsAmount = Number(ilsOff.toFixed(2));
    // ניכוי נקודות מדויק, ללא חריגה ממה שיש למשתמש (הגנה מפני שגיאות עיגול)
    breakdown.pointsUsed = Math.min(usable, Math.ceil(ilsOff * POINTS_PER_ILS - 1e-6));
    price -= ilsOff;
  }
  breakdown.final = Number(Math.max(0, price).toFixed(2));
  return breakdown;
}

// ---------- הרשמה + תשלום (מדומה) ----------
app.post('/api/races/:id/register', (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.phone) return res.status(400).json({ error: 'שם מלא וטלפון הם שדות חובה' });
  const db = readDb();
  const race = db.races.find((r) => r.id === req.params.id);
  if (!race) return res.status(404).json({ error: 'מרוץ לא נמצא' });
  if (race.capacity && race.registrations.length >= race.capacity) {
    return res.status(409).json({ error: 'המרוץ מלא, לא ניתן להירשם' });
  }

  const user = b.email ? db.users.find((u) => u.email.toLowerCase() === String(b.email).toLowerCase()) : null;
  let discount = null;
  if (b.discountCode) {
    const codeUp = String(b.discountCode).trim().toUpperCase();
    discount = db.discounts.find((d) => d.code === codeUp) || null;
    if (b.discountCode && !discount) return res.status(400).json({ error: 'קוד הנחה לא תקין' });
  }
  const pointsToUse = b.usePoints && user ? Number(b.pointsToUse || user.points) : 0;
  const breakdown = computePrice(race, discount, pointsToUse, user);

  // תשלום מדומה: תומך ב-apple_pay / credit_card / other.
  // בסביבת ייצור יש לחבר כאן ספק אמיתי (Stripe / Apple Pay) עם אימות דומיין ו-HTTPS.
  const method = ['apple_pay', 'credit_card', 'other'].includes(b.method) ? b.method : 'other';
  if (breakdown.final > 0 && method === 'credit_card') {
    const card = b.card || {};
    if (!card.number || String(card.number).replace(/\s/g, '').length < 12) {
      return res.status(400).json({ error: 'פרטי כרטיס אשראי לא תקינים' });
    }
  }

  // ניכוי נקודות שנוצלו
  if (user && breakdown.pointsUsed > 0) {
    user.points = Math.max(0, user.points - breakdown.pointsUsed);
  }

  const registration = {
    id: crypto.randomUUID(),
    userId: user ? user.id : null,
    name: String(b.name).trim(),
    phone: String(b.phone).trim(),
    email: (b.email || '').trim(),
    paid: true,
    method,
    pricePaid: breakdown.final,
    discountCode: discount ? discount.code : null,
    pointsUsed: breakdown.pointsUsed,
    registeredAt: new Date().toISOString(),
  };
  race.registrations.push(registration);
  writeDb(db);
  res.status(201).json({ registration, breakdown, registeredCount: race.registrations.length });
});

// ---------- ריצות (טלמטריה + אנטי-רמאות + נקודות) ----------
app.post('/api/runs', (req, res) => {
  const b = req.body || {};
  const db = readDb();
  const user = b.userId ? db.users.find((u) => u.id === b.userId) : null;
  if (!user) return res.status(400).json({ error: 'נדרשת זהות משתמש (userId)' });

  const verdict = validateRun(b.samples || []);
  const last = (b.samples || []).slice(-1)[0] || null;

  let pointsEarned = 0;
  let dailyBonus = 0;
  if (verdict.verified) {
    // בדיקת יעד יומי לפני העדכון
    const kmBefore = db.runs
      .filter((r) => r.userId === user.id && r.date === todayStr() && r.verified)
      .reduce((a, r) => a + r.distanceKm, 0);
    pointsEarned = Math.round(verdict.distanceKm * POINTS_PER_KM);
    if (kmBefore < DAILY_GOAL_KM && kmBefore + verdict.distanceKm >= DAILY_GOAL_KM) {
      dailyBonus = DAILY_GOAL_BONUS;
      pointsEarned += dailyBonus;
    }
    user.points += pointsEarned;
  }

  const run = {
    id: crypto.randomUUID(),
    userId: user.id,
    raceId: b.raceId || null,
    date: todayStr(),
    distanceKm: verdict.distanceKm,
    durationSec: verdict.durationSec,
    avgSpeedKmh: verdict.avgSpeedKmh,
    avgHr: verdict.avgHr,
    avgCadence: verdict.avgCadence,
    verified: verdict.verified,
    flags: verdict.flags,
    lastPos: last && typeof last.lat === 'number' ? { lat: last.lat, lng: last.lng } : null,
    createdAt: new Date().toISOString(),
  };
  db.runs.push(run);
  writeDb(db);

  res.status(201).json({ run, verdict, pointsEarned, dailyBonus, user: publicUser(db, user) });
});

// מפה חיה בסגנון סטרבה: רצים בקרבת מקום
// מחזיר משתתפים באותה תחרות + רצים נוספים בסביבה (חלקם מדומים לצורך הדגמה)
app.get('/api/live', (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const raceId = req.query.raceId || null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'נדרשים lat ו-lng' });
  }
  const db = readDb();

  // רצים אמיתיים אחרונים עם מיקום (5 דקות אחרונות)
  const now = Date.now();
  const realRunners = db.runs
    .filter((r) => r.lastPos && now - new Date(r.createdAt).getTime() < 5 * 60 * 1000)
    .map((r) => {
      const u = db.users.find((x) => x.id === r.userId);
      return {
        id: r.id,
        name: u ? u.name || 'רץ/ה' : 'רץ/ה',
        lat: r.lastPos.lat,
        lng: r.lastPos.lng,
        inRace: raceId ? r.raceId === raceId : false,
        distanceKm: Math.round(haversineKm({ lat, lng }, r.lastPos) * 1000) / 1000,
        live: true,
        simulated: false,
      };
    });

  // רצים מדומים בסביבה להדגמת המפה (מיקום דטרמיניסטי-יחסי)
  const seed = Math.floor((lat + lng) * 1000);
  const rand = (n) => {
    const x = Math.sin(seed + n) * 10000;
    return x - Math.floor(x);
  };
  const names = ['נועה', 'איתי', 'שירה', 'עומר', 'מאיה', 'דן'];
  const simulated = names.map((name, i) => {
    const dLat = (rand(i) - 0.5) * 0.03; // ~1.5 ק"מ ברדיוס
    const dLng = (rand(i + 100) - 0.5) * 0.03;
    const pos = { lat: lat + dLat, lng: lng + dLng };
    return {
      id: `sim-${i}`,
      name,
      lat: pos.lat,
      lng: pos.lng,
      inRace: raceId ? rand(i + 200) > 0.5 : false,
      distanceKm: Math.round(haversineKm({ lat, lng }, pos) * 1000) / 1000,
      live: true,
      simulated: true,
    };
  });

  res.json({ center: { lat, lng }, runners: [...realRunners, ...simulated] });
});

// קונפיגורציה ציבורית (חוקי נקודות) לשימוש בממשק
app.get('/api/config', (req, res) => {
  res.json({ pointsPerKm: POINTS_PER_KM, dailyGoalKm: DAILY_GOAL_KM, dailyGoalBonus: DAILY_GOAL_BONUS, pointsPerIls: POINTS_PER_ILS });
});

app.listen(PORT, () => {
  console.log(`🏃 אפליקציית המרוצים רצה בכתובת http://localhost:${PORT}`);
});
