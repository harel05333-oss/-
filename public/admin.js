'use strict';

const { t } = window.i18n;

const loginView = document.getElementById('loginView');
const adminView = document.getElementById('adminView');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');
const raceForm = document.getElementById('raceForm');
const adminRacesEl = document.getElementById('adminRaces');
const adminSubtitle = document.getElementById('adminSubtitle');
const discountForm = document.getElementById('discountForm');
const discountList = document.getElementById('discountList');
const toastEl = document.getElementById('toast');

const regsModal = document.getElementById('regsModal');
const regsTitle = document.getElementById('regsTitle');
const regsSub = document.getElementById('regsSub');
const regsBody = document.getElementById('regsBody');

const KEY_STORAGE = 'racesAdminKey';
let adminKey = sessionStorage.getItem(KEY_STORAGE) || '';
let racesCache = [];

function localeTag() { return window.i18n.getLang() === 'he' ? 'he-IL' : 'en-GB'; }

function formatDate(d, tm) {
  if (!d) return '';
  const dt = new Date(`${d}T${tm || '00:00'}`);
  if (Number.isNaN(dt.getTime())) return d;
  let s = dt.toLocaleDateString(localeTag(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return tm ? `${s} · ${tm}` : s;
}

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function showToast(msg, type = 'ok') {
  toastEl.textContent = msg;
  toastEl.className = `toast show ${type}`;
  setTimeout(() => { toastEl.className = 'toast'; }, 3400);
}

function adminHeaders(json = true) {
  const h = { 'x-admin-key': adminKey };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

function showDashboard() { loginView.style.display = 'none'; adminView.style.display = 'block'; logoutBtn.style.display = 'inline-block'; loadRaces(); loadDiscounts(); }
function showLogin() { loginView.style.display = 'block'; adminView.style.display = 'none'; logoutBtn.style.display = 'none'; }

async function verifyKey(key) {
  const res = await fetch('/api/admin/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
  return (await res.json()).ok;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = document.getElementById('adminKey').value;
  if (await verifyKey(key)) {
    adminKey = key;
    sessionStorage.setItem(KEY_STORAGE, key);
    showToast(t('adm.toast.loginOk'), 'ok');
    showDashboard();
  } else showToast(t('adm.toast.loginBad'), 'err');
});

logoutBtn.addEventListener('click', () => { adminKey = ''; sessionStorage.removeItem(KEY_STORAGE); showLogin(); });

raceForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const cap = document.getElementById('capacity').value;
  const payload = {
    title: document.getElementById('title').value.trim(),
    distanceKm: document.getElementById('distanceKm').value,
    date: document.getElementById('date').value,
    time: document.getElementById('time').value,
    price: document.getElementById('price').value || 0,
    startMode: document.getElementById('startMode').value,
    capacity: cap ? Number(cap) : null,
    location: document.getElementById('location').value.trim(),
    prizes: {
      first: document.getElementById('prizeFirst').value.trim(),
      second: document.getElementById('prizeSecond').value.trim(),
      third: document.getElementById('prizeThird').value.trim(),
    },
    description: document.getElementById('description').value.trim(),
    howToJoin: document.getElementById('howToJoin').value.trim(),
  };
  try {
    const res = await fetch('/api/races', { method: 'POST', headers: adminHeaders(), body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t('toast.err'));
    showToast(t('adm.toast.raceOk'), 'ok');
    raceForm.reset();
    loadRaces();
  } catch (err) { showToast(err.message, 'err'); }
});

discountForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = document.getElementById('dcCode').value.trim();
  const percent = document.getElementById('dcPercent').value;
  try {
    const res = await fetch('/api/discounts', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ code, percent }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t('toast.err'));
    showToast(t('adm.toast.dcOk', { code: data.discount.code }), 'ok');
    discountForm.reset();
    loadDiscounts();
  } catch (err) { showToast(err.message, 'err'); }
});

async function loadDiscounts() {
  try {
    const res = await fetch('/api/discounts', { headers: adminHeaders(false) });
    const { discounts } = await res.json();
    if (!discounts || !discounts.length) { discountList.innerHTML = `<p class="hint">${t('adm.dc.empty')}</p>`; return; }
    discountList.innerHTML = `<div class="tags">${discounts.map((d) => `<span class="tag red" data-id="${d.id}">${esc(d.code)} · ${d.percent}%- <b style="cursor:pointer;color:#fff">✕</b></span>`).join('')}</div>`;
    discountList.querySelectorAll('.tag b').forEach((b) => b.addEventListener('click', async () => {
      await fetch(`/api/discounts/${b.parentElement.dataset.id}`, { method: 'DELETE', headers: adminHeaders(false) });
      loadDiscounts();
    }));
  } catch (e) { discountList.innerHTML = ''; }
}

function adminCard(race) {
  const cap = race.capacity ? `${race.registeredCount}/${race.capacity}` : `${race.registeredCount}`;
  const startTag = race.startMode === 'anytime' ? t('card.freerun') : t('card.collective');
  const p = race.prizes || {};
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-head"><div class="card-title">${esc(race.title)}</div><div class="distance-badge">${esc(String(race.distanceKm))} ${t('run.stat.dist')}</div></div>
    <div class="tags"><span class="tag red">${startTag}</span><span class="tag white">${race.price ? '₪' + race.price : t('card.free')}</span></div>
    <div class="meta">
      <div class="meta-row"><span class="ico">📅</span><span>${esc(formatDate(race.date, race.time))}</span></div>
      ${race.location ? `<div class="meta-row"><span class="ico">📍</span><span>${esc(race.location)}</span></div>` : ''}
      <div class="meta-row"><span class="ico">👥</span><span>${cap}</span></div>
    </div>
    ${(p.first || p.second || p.third) ? `<div class="prizes">
      ${p.first ? `<div class="prow">🥇 <span>${esc(p.first)}</span></div>` : ''}
      ${p.second ? `<div class="prow">🥈 <span>${esc(p.second)}</span></div>` : ''}
      ${p.third ? `<div class="prow">🥉 <span>${esc(p.third)}</span></div>` : ''}</div>` : ''}`;
  const foot = document.createElement('div');
  foot.className = 'card-foot';
  const viewBtn = document.createElement('button');
  viewBtn.className = 'btn btn-ghost btn-sm';
  viewBtn.textContent = t('adm.card.registrantsN', { n: race.registeredCount });
  viewBtn.addEventListener('click', () => openRegistrations(race));
  const delBtn = document.createElement('button');
  delBtn.className = 'btn btn-danger btn-sm';
  delBtn.textContent = t('adm.card.delete');
  delBtn.addEventListener('click', () => deleteRace(race));
  foot.appendChild(viewBtn);
  foot.appendChild(delBtn);
  card.appendChild(foot);
  return card;
}

function renderRaces() {
  adminRacesEl.innerHTML = '';
  if (!racesCache.length) {
    adminSubtitle.textContent = '';
    adminRacesEl.innerHTML = `<div class="empty">${t('adm.races.empty')}</div>`;
    return;
  }
  adminSubtitle.textContent = t('adm.races.count', { n: racesCache.length });
  racesCache.forEach((r) => adminRacesEl.appendChild(adminCard(r)));
}

async function loadRaces() {
  try {
    const res = await fetch('/api/races');
    racesCache = (await res.json()).races || [];
    renderRaces();
  } catch (e) { adminSubtitle.textContent = t('toast.err'); }
}

async function deleteRace(race) {
  if (!confirm(t('adm.confirmDelete', { title: race.title }))) return;
  try {
    const res = await fetch(`/api/races/${race.id}`, { method: 'DELETE', headers: adminHeaders(false) });
    if (!res.ok) throw new Error(t('toast.err'));
    showToast(t('adm.toast.deleted'), 'ok');
    loadRaces();
  } catch (err) { showToast(err.message, 'err'); }
}

async function openRegistrations(race) {
  regsTitle.textContent = t('adm.regs.title', { title: race.title });
  regsSub.textContent = '…';
  regsBody.innerHTML = '';
  regsModal.classList.add('open');
  try {
    const res = await fetch(`/api/races/${race.id}/registrations`, { headers: adminHeaders(false) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t('toast.err'));
    const regs = data.registrations || [];
    const revenue = regs.reduce((a, r) => a + (r.pricePaid || 0), 0);
    regsSub.textContent = t('adm.regs.sub', { n: regs.length, rev: revenue.toFixed(2) });
    if (!regs.length) { regsBody.innerHTML = `<div class="empty">${t('adm.regs.empty')}</div>`; return; }
    const rows = regs.map((r, i) => `
      <tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.phone)}</td><td>${esc(r.email || '—')}</td>
      <td>₪${(r.pricePaid || 0).toFixed(2)}</td><td>${t('method.' + r.method)}</td><td>${r.discountCode ? esc(r.discountCode) : '—'}</td><td>${r.pointsUsed || 0}</td></tr>`).join('');
    regsBody.innerHTML = `<div style="overflow-x:auto"><table class="reg-table">
      <thead><tr><th>#</th><th>${t('adm.regs.h.name')}</th><th>${t('adm.regs.h.phone')}</th><th>${t('adm.regs.h.email')}</th><th>${t('adm.regs.h.paid')}</th><th>${t('adm.regs.h.method')}</th><th>${t('adm.regs.h.code')}</th><th>${t('adm.regs.h.points')}</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  } catch (err) { regsSub.textContent = err.message; }
}

document.getElementById('regsClose').addEventListener('click', () => regsModal.classList.remove('open'));
regsModal.addEventListener('click', (e) => { if (e.target === regsModal) regsModal.classList.remove('open'); });

(async function init() {
  window.i18n.initI18n(() => { if (adminView.style.display !== 'none') { renderRaces(); loadDiscounts(); } });
  if (adminKey && (await verifyKey(adminKey))) showDashboard();
  else { adminKey = ''; sessionStorage.removeItem(KEY_STORAGE); showLogin(); }
})();
