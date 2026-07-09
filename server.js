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
const DATA_FILE = path.join(DATA_DIR, 'races.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ races: [] }, null, 2));
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeStore(data) {
  ensureStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function requireAdmin(req, res, next) {
  const key = req.get('x-admin-key');
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'סיסמת מנהל שגויה' });
  next();
}

function sortByStart(a, b) {
  const da = new Date(`${a.date}T${a.time || '00:00'}`);
  const db = new Date(`${b.date}T${b.time || '00:00'}`);
  return da - db;
}

// בדיקת סיסמת מנהל
app.post('/api/admin/verify', (req, res) => {
  const { key } = req.body || {};
  res.json({ ok: key === ADMIN_KEY });
});

// רשימת מרוצים ציבורית (ללא פרטי הנרשמים)
app.get('/api/races', (req, res) => {
  const { races } = readStore();
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
      registeredCount: Array.isArray(r.registrations) ? r.registrations.length : 0,
    }))
    .sort(sortByStart);
  res.json({ races: publicRaces });
});

// יצירת מרוץ (מנהל)
app.post('/api/races', requireAdmin, (req, res) => {
  const { title, date, time, location, distanceKm, description, howToJoin, capacity } = req.body || {};
  if (!title || !date || distanceKm === undefined || distanceKm === null || distanceKm === '') {
    return res.status(400).json({ error: 'שם המרוץ, תאריך ומרחק (ק"מ) הם שדות חובה' });
  }
  const store = readStore();
  const race = {
    id: crypto.randomUUID(),
    title: String(title).trim(),
    date,
    time: time || '',
    location: location || '',
    distanceKm: Number(distanceKm),
    description: description || '',
    howToJoin: howToJoin || '',
    capacity: capacity ? Number(capacity) : null,
    createdAt: new Date().toISOString(),
    registrations: [],
  };
  store.races.push(race);
  writeStore(store);
  res.status(201).json({ race });
});

// מחיקת מרוץ (מנהל)
app.delete('/api/races/:id', requireAdmin, (req, res) => {
  const store = readStore();
  const before = store.races.length;
  store.races = store.races.filter((r) => r.id !== req.params.id);
  if (store.races.length === before) return res.status(404).json({ error: 'מרוץ לא נמצא' });
  writeStore(store);
  res.json({ ok: true });
});

// רשימת נרשמים למרוץ (מנהל)
app.get('/api/races/:id/registrations', requireAdmin, (req, res) => {
  const store = readStore();
  const race = store.races.find((r) => r.id === req.params.id);
  if (!race) return res.status(404).json({ error: 'מרוץ לא נמצא' });
  res.json({ race: { id: race.id, title: race.title }, registrations: race.registrations });
});

// הרשמה למרוץ (ציבורי)
app.post('/api/races/:id/register', (req, res) => {
  const { name, phone, email } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: 'שם מלא וטלפון הם שדות חובה' });
  const store = readStore();
  const race = store.races.find((r) => r.id === req.params.id);
  if (!race) return res.status(404).json({ error: 'מרוץ לא נמצא' });
  if (race.capacity && race.registrations.length >= race.capacity) {
    return res.status(409).json({ error: 'המרוץ מלא, לא ניתן להירשם' });
  }
  const registration = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    phone: String(phone).trim(),
    email: (email || '').trim(),
    registeredAt: new Date().toISOString(),
  };
  race.registrations.push(registration);
  writeStore(store);
  res.status(201).json({ registration, registeredCount: race.registrations.length });
});

app.listen(PORT, () => {
  console.log(`🏃 אפליקציית המרוצים רצה בכתובת http://localhost:${PORT}`);
});
