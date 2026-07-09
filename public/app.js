'use strict';

const racesEl = document.getElementById('races');
const subtitleEl = document.getElementById('subtitle');
const modal = document.getElementById('checkoutModal');
const form = document.getElementById('checkoutForm');
const coRaceName = document.getElementById('coRaceName');
const toastEl = document.getElementById('toast');
const breakdownEl = document.getElementById('breakdown');
const usePointsWrap = document.getElementById('usePointsWrap');
const pointsLabel = document.getElementById('pointsLabel');

let currentRace = null;
let selectedMethod = 'apple_pay';
let appliedDiscount = null; // {code, percent}
let currentUser = null;
let cfg = { pointsPerIls: 25 };

const daysHe = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const monthsHe = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function formatDate(dateStr, timeStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T${timeStr || '00:00'}`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const text = `יום ${daysHe[d.getDay()]}, ${d.getDate()} ב${monthsHe[d.getMonth()]} ${d.getFullYear()}`;
  return timeStr ? `${text} · ${timeStr}` : text;
}

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function showToast(message, type = 'ok') {
  toastEl.textContent = message;
  toastEl.className = `toast show ${type}`;
  setTimeout(() => { toastEl.className = 'toast'; }, 3400);
}

function priceHtml(race) {
  if (!race.price) return '<span class="price-row"><span class="amount free">חינם</span></span>';
  return `<span class="price-row"><span class="amount">₪${esc(String(race.price))}</span></span>`;
}

function raceCard(race) {
  const isFull = race.capacity && race.registeredCount >= race.capacity;
  const capacityText = race.capacity ? `${race.registeredCount}/${race.capacity} נרשמו` : `${race.registeredCount} נרשמו`;
  const startTag = race.startMode === 'anytime'
    ? '<span class="tag">🕒 ריצה חופשית</span>'
    : '<span class="tag red">🚦 הזנקה קולקטיבית</span>';
  const prizes = race.prizes || {};
  const hasPrizes = prizes.first || prizes.second || prizes.third;

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-head">
      <div class="card-title">${esc(race.title)}</div>
      <div class="distance-badge">${esc(String(race.distanceKm))} ק"מ</div>
    </div>
    <div class="tags">${startTag}${race.location ? `<span class="tag">📍 ${esc(race.location)}</span>` : ''}</div>
    <div class="meta">
      <div class="meta-row"><span class="ico">📅</span><span>${esc(formatDate(race.date, race.time))}</span></div>
    </div>
    ${race.description ? `<div class="desc">${esc(race.description)}</div>` : ''}
    ${hasPrizes ? `<div class="prizes">
        ${prizes.first ? `<div class="prow">🥇 <span>${esc(prizes.first)}</span></div>` : ''}
        ${prizes.second ? `<div class="prow">🥈 <span>${esc(prizes.second)}</span></div>` : ''}
        ${prizes.third ? `<div class="prow">🥉 <span>${esc(prizes.third)}</span></div>` : ''}
      </div>` : ''}
    ${race.howToJoin ? `<div class="join-box"><b>איך מתחברים:</b> ${esc(race.howToJoin)}</div>` : ''}
    <div class="card-foot">
      <div>${priceHtml(race)}<div class="reg-count">${capacityText}</div></div>
    </div>`;

  const foot = card.querySelector('.card-foot');
  if (isFull) {
    const t = document.createElement('span');
    t.className = 'full-tag';
    t.textContent = 'המרוץ מלא';
    foot.appendChild(t);
  } else {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = race.price ? 'הרשמה ותשלום' : 'הרשמה';
    btn.addEventListener('click', () => openCheckout(race));
    foot.appendChild(btn);
  }
  return card;
}

async function loadRaces() {
  try {
    const res = await fetch('/api/races');
    const { races } = await res.json();
    racesEl.innerHTML = '';
    if (!races.length) {
      subtitleEl.textContent = 'אין כרגע מרוצים פתוחים.';
      racesEl.innerHTML = '<div class="empty">עדיין לא נוספו מרוצים. חזרו בקרוב! 🏁</div>';
      return;
    }
    subtitleEl.textContent = `${races.length} מרוצים מחכים לכם`;
    races.forEach((r) => racesEl.appendChild(raceCard(r)));
  } catch (e) {
    subtitleEl.textContent = 'שגיאה בטעינת המרוצים.';
  }
}

// ---------- Checkout ----------
function openCheckout(race) {
  currentRace = race;
  appliedDiscount = null;
  currentUser = null;
  selectedMethod = 'apple_pay';
  form.reset();
  document.querySelectorAll('.pay-opt').forEach((el) => el.classList.toggle('active', el.dataset.method === 'apple_pay'));
  document.getElementById('cardFields').style.display = 'none';
  usePointsWrap.style.display = 'none';
  coRaceName.textContent = `${race.title} · ${race.distanceKm} ק"מ · ${race.price ? '₪' + race.price : 'חינם'}`;
  renderBreakdown();
  modal.classList.add('open');
  document.getElementById('coName').focus();
}

function closeCheckout() { modal.classList.remove('open'); currentRace = null; }

function renderBreakdown() {
  if (!currentRace) return;
  const base = currentRace.price || 0;
  let price = base;
  const rows = [`<div class="brow"><span>מחיר מרוץ</span><span>₪${base}</span></div>`];
  if (appliedDiscount) {
    const amt = +(base * appliedDiscount.percent / 100).toFixed(2);
    price -= amt;
    rows.push(`<div class="brow"><span>קוד ${esc(appliedDiscount.code)} (${appliedDiscount.percent}%-)</span><span class="neg">₪${amt}-</span></div>`);
  }
  const usePoints = document.getElementById('coUsePoints').checked;
  if (usePoints && currentUser && currentUser.points > 0) {
    const maxIls = currentUser.points / cfg.pointsPerIls;
    const off = Math.min(maxIls, price);
    price -= off;
    rows.push(`<div class="brow"><span>נקודות (${currentUser.points} נק')</span><span class="neg">₪${off.toFixed(2)}-</span></div>`);
  }
  rows.push(`<div class="brow total"><span>לתשלום</span><span>${price <= 0 ? 'חינם 🎉' : '₪' + price.toFixed(2)}</span></div>`);
  breakdownEl.innerHTML = rows.join('');
}

document.getElementById('payMethods').addEventListener('click', (e) => {
  const opt = e.target.closest('.pay-opt');
  if (!opt) return;
  selectedMethod = opt.dataset.method;
  document.querySelectorAll('.pay-opt').forEach((el) => el.classList.toggle('active', el === opt));
  document.getElementById('cardFields').style.display = selectedMethod === 'credit_card' ? 'flex' : 'none';
});

document.getElementById('coUsePoints').addEventListener('change', renderBreakdown);

document.getElementById('coEmail').addEventListener('blur', async () => {
  const email = document.getElementById('coEmail').value.trim();
  if (!email) { usePointsWrap.style.display = 'none'; currentUser = null; renderBreakdown(); return; }
  try {
    const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name: document.getElementById('coName').value.trim() }) });
    const { user } = await res.json();
    currentUser = user;
    if (user.points > 0) {
      usePointsWrap.style.display = 'inline-flex';
      pointsLabel.textContent = `שימוש ב-${user.points} הנקודות שלי (עד ₪${user.ilsOffAvailable} הנחה)`;
    } else {
      usePointsWrap.style.display = 'none';
    }
    renderBreakdown();
  } catch (e) { /* ignore */ }
});

document.getElementById('applyDiscount').addEventListener('click', async () => {
  const code = document.getElementById('coDiscount').value.trim();
  if (!code) return;
  const res = await fetch('/api/discounts/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  const data = await res.json();
  if (data.valid) {
    appliedDiscount = { code: data.code, percent: data.percent };
    showToast(`קוד ${data.code} הוחל (${data.percent}%- הנחה)`, 'ok');
  } else {
    appliedDiscount = null;
    showToast('קוד הנחה לא תקין', 'err');
  }
  renderBreakdown();
});

document.getElementById('coCancel').addEventListener('click', closeCheckout);
modal.addEventListener('click', (e) => { if (e.target === modal) closeCheckout(); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentRace) return;
  const payload = {
    name: document.getElementById('coName').value.trim(),
    phone: document.getElementById('coPhone').value.trim(),
    email: document.getElementById('coEmail').value.trim(),
    method: selectedMethod,
    discountCode: appliedDiscount ? appliedDiscount.code : '',
    usePoints: document.getElementById('coUsePoints').checked,
    card: selectedMethod === 'credit_card' ? { number: document.getElementById('coCard').value, exp: document.getElementById('coExp').value, cvc: document.getElementById('coCvc').value } : undefined,
  };
  try {
    const res = await fetch(`/api/races/${currentRace.id}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'שגיאה בהרשמה');
    closeCheckout();
    const paidTxt = data.breakdown.final <= 0 ? 'ללא תשלום (נוצלו נקודות/הנחה)' : `שולם ₪${data.breakdown.final}`;
    showToast(`נרשמת בהצלחה! ${paidTxt} 🎉`, 'ok');
    loadRaces();
  } catch (err) {
    showToast(err.message, 'err');
  }
});

async function init() {
  try { cfg = await (await fetch('/api/config')).json(); } catch (e) { /* keep default */ }
  loadRaces();
}
init();
