'use strict';

const racesEl = document.getElementById('races');
const subtitleEl = document.getElementById('subtitle');
const modal = document.getElementById('regModal');
const regForm = document.getElementById('regForm');
const regRaceName = document.getElementById('regRaceName');
const toastEl = document.getElementById('toast');

let currentRaceId = null;

const daysHe = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const monthsHe = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function formatDate(dateStr, timeStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T${timeStr || '00:00'}`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = daysHe[d.getDay()];
  const text = `יום ${day}, ${d.getDate()} ב${monthsHe[d.getMonth()]} ${d.getFullYear()}`;
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

function raceCard(race) {
  const isFull = race.capacity && race.registeredCount >= race.capacity;
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
    </div>
    ${race.description ? `<div class="desc">${escapeHtml(race.description)}</div>` : ''}
    ${race.howToJoin ? `<div class="join-box"><b>איך מתחברים:</b> ${escapeHtml(race.howToJoin)}</div>` : ''}
    <div class="card-foot">
      <span class="reg-count">${capacityText}</span>
    </div>
  `;

  const foot = card.querySelector('.card-foot');
  if (isFull) {
    const tag = document.createElement('span');
    tag.className = 'full-tag';
    tag.textContent = 'המרוץ מלא';
    foot.appendChild(tag);
  } else {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = 'הרשמה';
    btn.addEventListener('click', () => openModal(race));
    foot.appendChild(btn);
  }
  return card;
}

async function loadRaces() {
  try {
    const res = await fetch('/api/races');
    const data = await res.json();
    const races = data.races || [];
    racesEl.innerHTML = '';
    if (races.length === 0) {
      subtitleEl.textContent = 'אין כרגע מרוצים פתוחים.';
      racesEl.innerHTML = '<div class="empty">עדיין לא נוספו מרוצים. חזרו בקרוב! 🏁</div>';
      return;
    }
    subtitleEl.textContent = `${races.length} מרוצים מחכים לכם`;
    races.forEach((race) => racesEl.appendChild(raceCard(race)));
  } catch (err) {
    subtitleEl.textContent = 'שגיאה בטעינת המרוצים.';
    showToast('שגיאה בטעינת המרוצים', 'err');
  }
}

function openModal(race) {
  currentRaceId = race.id;
  regRaceName.textContent = `${race.title} · ${race.distanceKm} ק"מ`;
  regForm.reset();
  modal.classList.add('open');
  document.getElementById('regName').focus();
}

function closeModal() {
  modal.classList.remove('open');
  currentRaceId = null;
}

document.getElementById('regCancel').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

regForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentRaceId) return;
  const payload = {
    name: document.getElementById('regName').value.trim(),
    phone: document.getElementById('regPhone').value.trim(),
    email: document.getElementById('regEmail').value.trim(),
  };
  try {
    const res = await fetch(`/api/races/${currentRaceId}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'שגיאה בהרשמה');
    closeModal();
    showToast('נרשמת בהצלחה! נתראה במרוץ 🎉', 'ok');
    loadRaces();
  } catch (err) {
    showToast(err.message, 'err');
  }
});

loadRaces();
