'use strict';

const loginView = document.getElementById('loginView');
const adminView = document.getElementById('adminView');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');
const raceForm = document.getElementById('raceForm');
const adminRacesEl = document.getElementById('adminRaces');
const adminSubtitle = document.getElementById('adminSubtitle');
const toastEl = document.getElementById('toast');

const regsModal = document.getElementById('regsModal');
const regsTitle = document.getElementById('regsTitle');
const regsSub = document.getElementById('regsSub');
const regsBody = document.getElementById('regsBody');

const KEY_STORAGE = 'racesAdminKey';
let adminKey = sessionStorage.getItem(KEY_STORAGE) || '';

const daysHe = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const monthsHe = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function formatDate(dateStr, timeStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T${timeStr || '00:00'}`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const text = `יום ${daysHe[d.getDay()]}, ${d.getDate()} ב${monthsHe[d.getMonth()]} ${d.getFullYear()}`;
  return timeStr ? `${text} · ${timeStr}` : text;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function showToast(message, type = 'ok') {
  toastEl.textContent = message;
  toastEl.className = `toast show ${type}`;
  setTimeout(() => { toastEl.className = 'toast'; }, 3200);
}

function showDashboard() {
  loginView.style.display = 'none';
  adminView.style.display = 'block';
  logoutBtn.style.display = 'inline-block';
  loadRaces();
}

function showLogin() {
  loginView.style.display = 'block';
  adminView.style.display = 'none';
  logoutBtn.style.display = 'none';
}

async function verifyKey(key) {
  const res = await fetch('/api/admin/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  const data = await res.json();
  return data.ok;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = document.getElementById('adminKey').value;
  if (await verifyKey(key)) {
    adminKey = key;
    sessionStorage.setItem(KEY_STORAGE, key);
    showToast('התחברת בהצלחה 👋', 'ok');
    showDashboard();
  } else {
    showToast('סיסמה שגויה', 'err');
  }
});

logoutBtn.addEventListener('click', () => {
  adminKey = '';
  sessionStorage.removeItem(KEY_STORAGE);
  showLogin();
});

raceForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const capacityVal = document.getElementById('capacity').value;
  const payload = {
    title: document.getElementById('title').value.trim(),
    distanceKm: document.getElementById('distanceKm').value,
    date: document.getElementById('date').value,
    time: document.getElementById('time').value,
    location: document.getElementById('location').value.trim(),
    capacity: capacityVal ? Number(capacityVal) : null,
    description: document.getElementById('description').value.trim(),
    howToJoin: document.getElementById('howToJoin').value.trim(),
  };
  try {
    const res = await fetch('/api/races', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'שגיאה ביצירת המרוץ');
    showToast('המרוץ נוצר בהצלחה! 🏁', 'ok');
    raceForm.reset();
    loadRaces();
  } catch (err) {
    showToast(err.message, 'err');
  }
});

function adminCard(race) {
  const capacityText = race.capacity
    ? `${race.registeredCount}/${race.capacity} נרשמו`
    : `${race.registeredCount} נרשמו`;
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-head">
      <div class="card-title">${escapeHtml(race.title)}</div>
      <div class="distance-badge">${escapeHtml(String(race.distanceKm))} ק"מ</div>
    </div>
    <div class="meta">
      <div class="meta-row"><span class="ico">📅</span><span>${escapeHtml(formatDate(race.date, race.time))}</span></div>
      ${race.location ? `<div class="meta-row"><span class="ico">📍</span><span>${escapeHtml(race.location)}</span></div>` : ''}
      <div class="meta-row"><span class="ico">👥</span><span>${capacityText}</span></div>
    </div>
    ${race.description ? `<div class="desc">${escapeHtml(race.description)}</div>` : ''}
  `;
  const foot = document.createElement('div');
  foot.className = 'card-foot';

  const viewBtn = document.createElement('button');
  viewBtn.className = 'btn btn-ghost';
  viewBtn.textContent = `👥 נרשמים (${race.registeredCount})`;
  viewBtn.addEventListener('click', () => openRegistrations(race));

  const delBtn = document.createElement('button');
  delBtn.className = 'btn btn-danger';
  delBtn.textContent = '🗑 מחיקה';
  delBtn.addEventListener('click', () => deleteRace(race));

  foot.appendChild(viewBtn);
  foot.appendChild(delBtn);
  card.appendChild(foot);
  return card;
}

async function loadRaces() {
  try {
    const res = await fetch('/api/races');
    const data = await res.json();
    const races = data.races || [];
    adminRacesEl.innerHTML = '';
    if (races.length === 0) {
      adminSubtitle.textContent = 'עדיין לא נוצרו מרוצים.';
      adminRacesEl.innerHTML = '<div class="empty">צרו את המרוץ הראשון בטופס למעלה ☝️</div>';
      return;
    }
    adminSubtitle.textContent = `${races.length} מרוצים במערכת`;
    races.forEach((race) => adminRacesEl.appendChild(adminCard(race)));
  } catch (err) {
    adminSubtitle.textContent = 'שגיאה בטעינה.';
  }
}

async function deleteRace(race) {
  if (!confirm(`למחוק את המרוץ "${race.title}"? פעולה זו תמחק גם את כל הנרשמים.`)) return;
  try {
    const res = await fetch(`/api/races/${race.id}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': adminKey },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'שגיאה במחיקה');
    showToast('המרוץ נמחק', 'ok');
    loadRaces();
  } catch (err) {
    showToast(err.message, 'err');
  }
}

async function openRegistrations(race) {
  regsTitle.textContent = `נרשמים · ${race.title}`;
  regsSub.textContent = 'טוען…';
  regsBody.innerHTML = '';
  regsModal.classList.add('open');
  try {
    const res = await fetch(`/api/races/${race.id}/registrations`, {
      headers: { 'x-admin-key': adminKey },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'שגיאה');
    const regs = data.registrations || [];
    regsSub.textContent = `${regs.length} נרשמו`;
    if (regs.length === 0) {
      regsBody.innerHTML = '<div class="empty">אין עדיין נרשמים למרוץ הזה.</div>';
      return;
    }
    const rows = regs.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.phone)}</td>
        <td>${escapeHtml(r.email || '—')}</td>
      </tr>`).join('');
    regsBody.innerHTML = `
      <table class="reg-table">
        <thead><tr><th>#</th><th>שם</th><th>טלפון</th><th>אימייל</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  } catch (err) {
    regsSub.textContent = err.message;
  }
}

document.getElementById('regsClose').addEventListener('click', () => regsModal.classList.remove('open'));
regsModal.addEventListener('click', (e) => { if (e.target === regsModal) regsModal.classList.remove('open'); });

// Auto-login if a valid key is already stored
(async function init() {
  if (adminKey && (await verifyKey(adminKey))) {
    showDashboard();
  } else {
    adminKey = '';
    sessionStorage.removeItem(KEY_STORAGE);
    showLogin();
  }
})();
