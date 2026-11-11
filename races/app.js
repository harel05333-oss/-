// Public page: create a user, join a race, report a result, show the leaderboard.
(function () {
  "use strict";
  const { cfg, client, configured, $, el, clear, parseTime, fmtTime, fmtDate, fmtClock, fmtKm, isActivityUrl, errorText, store } = window.TH;
  const SUBMIT_GRACE_MS = 12 * 3600 * 1000; // must match submit_result() in schema.sql
  const ME_KEY = "th_runner";

  if (cfg.whatsappLink) $("waLink").href = cfg.whatsappLink;
  if (cfg.communityUrl) $("brandLink").href = cfg.communityUrl;

  let me = store.get(ME_KEY);   // { id, token, name, city } or null
  let races = [];
  let current = null;           // the race on screen
  let mine = null;              // my_result() for the race on screen
  let timer = null;

  const startMs = r => new Date(r.starts_at).getTime();
  const endMs = r => new Date(r.ends_at).getTime();

  function phase(r, now) {
    if (now < startMs(r)) return "before";
    if (now < endMs(r)) return "window";
    if (now < endMs(r) + SUBMIT_GRACE_MS) return "reporting";
    return "done";
  }

  function setState(text, kind) {
    const s = $("pageState");
    if (!text) { s.hidden = true; return; }
    s.className = "notice " + (kind || "info");
    s.textContent = text;
    s.hidden = false;
  }
  function showErr(node, text) { node.textContent = text; node.hidden = !text; }

  /* ---------- my user ---------- */
  function renderProfile() {
    $("profileCard").hidden = false;
    $("pfNew").hidden = !!me;
    $("pfMine").hidden = !me;
    if (!me) return;
    $("pfHello").textContent = "שלום " + me.name + " מ" + me.city + ". המשתמש שלך מוכן.";
    $("pfNext").textContent = races.length
      ? "מכאן נרשמים למרוץ בלחיצה אחת."
      : "ברגע שייפתח מרוץ, נודיע בקהילה ותוכלו להירשם אליו כאן בלחיצה אחת.";
  }

  function forgetReset() {
    $("pfForget").hidden = false; $("pfForgetYes").hidden = true; $("pfForgetNo").hidden = true;
  }
  $("pfForget").addEventListener("click", () => {
    $("pfForget").hidden = true; $("pfForgetYes").hidden = false; $("pfForgetNo").hidden = false;
  });
  $("pfForgetNo").addEventListener("click", forgetReset);
  $("pfForgetYes").addEventListener("click", () => {
    store.del(ME_KEY); me = null; mine = null;
    forgetReset(); renderProfile();
    if (current) tick();
  });

  $("pfForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const err = $("pfErr"), btn = $("pfBtn");
    const name = $("pfName").value.trim().replace(/\s+/g, " ");
    const city = $("pfCity").value.trim().replace(/\s+/g, " ");
    if (name.length < 2 || city.length < 2) return showErr(err, "צריך למלא שם ועיר.");
    showErr(err, ""); btn.disabled = true; btn.textContent = "יוצר...";
    const { data, error } = await client.rpc("create_runner", { p_name: name, p_city: city });
    btn.disabled = false; btn.textContent = "יצירת משתמש";
    if (error || !data) return showErr(err, errorText(error));
    me = { id: data.runner_id, token: data.token, name: data.name, city: data.city };
    store.set(ME_KEY, me);
    $("pfForm").reset();
    renderProfile();
    loadCount();
    if (current) { mine = { user: true, registered: false }; tick(); }
  });

  async function checkMe() {
    if (!me) return;
    const { data, error } = await client.rpc("runner_me", { p_runner: me.id, p_token: me.token });
    if (error || !data) return;                 // offline: keep what we have
    if (data.ok === false) { store.del(ME_KEY); me = null; }
    else { me.name = data.name; me.city = data.city; store.set(ME_KEY, me); }
  }

  async function loadCount() {
    const { data, error } = await client.rpc("runner_count");
    const n = $("pfCount");
    if (error || typeof data !== "number" || data < 5) { n.hidden = true; return; }
    n.textContent = "כבר " + data + " רצים יצרו משתמש.";
    n.hidden = false;
  }

  /* ---------- races ---------- */
  async function init() {
    if (!configured || !client) {
      setState("האתר עדיין בהקמה. ההרשמה תיפתח בקרוב, ונודיע על זה בקהילת הוואטסאפ.", "info");
      return;
    }
    await checkMe();
    renderProfile();
    loadCount();
    const { data, error } = await client.from("races")
      .select("*,starts_at,ends_at")
      .order("race_date", { ascending: true });
    if (error) { setState("לא הצלחנו לטעון את המרוצים. נסו לרענן בעוד כמה דקות.", "bad"); return; }
    races = data || [];
    renderProfile();
    if (!races.length) { setState("עוד אין מרוץ פתוח. המרוץ הראשון יפורסם בקהילת הוואטסאפ.", "info"); return; }
    setState("");
    const now = Date.now();
    // Show the next race that is still running or reporting; otherwise the latest finished one.
    const live = races.filter(r => phase(r, now) !== "done");
    const pick = live.length ? live[0] : races[races.length - 1];
    renderRaceList(pick.id);
    showRace(pick);
  }

  function renderRaceList(selectedId) {
    const box = $("raceList");
    clear(box);
    if (races.length < 2) { $("otherRaces").hidden = true; return; }
    races.slice().reverse().forEach(r => {
      const b = el("button", "raceitem");
      b.type = "button";
      b.setAttribute("aria-current", String(r.id === selectedId));
      b.append(el("b", "", r.title), el("span", "small muted", fmtDate(r.starts_at) + " · " + fmtKm(r.distance_km)));
      b.addEventListener("click", () => {
        renderRaceList(r.id);
        showRace(r);
        $("raceView").scrollIntoView({ block: "start" });
      });
      box.append(b);
    });
    $("otherRaces").hidden = false;
  }

  function showRace(r) {
    current = r;
    mine = null;
    $("raceTitle").textContent = r.title;
    $("raceKm").textContent = fmtKm(r.distance_km);
    $("raceWindow").textContent = fmtClock(r.starts_at) + "–" + fmtClock(r.ends_at);
    $("raceDate").textContent = fmtDate(r.starts_at);
    $("raceCount").textContent = "0";
    renderMoney(r);
    $("finishForm").hidden = true;
    showErr($("joinErr"), "");
    $("runnersCard").hidden = true;
    renderBoard([]);
    $("raceView").hidden = false;
    if (timer) clearInterval(timer);
    tick();
    timer = setInterval(tick, 1000);
    loadRunners(r);
    loadBoard(r);
    loadMine(r);
  }

  // Optional entry fee, payment link and prize. Hidden when the race has none.
  function renderMoney(r) {
    const fee = Number(r.fee_ils) || 0, prize = (r.prize || "").trim();
    $("moneyCard").hidden = !(fee > 0 || prize);
    $("feeRow").hidden = !(fee > 0);
    $("feeText").textContent = fee + " ₪";
    const pay = $("payLink"), ok = fee > 0 && /^https:\/\/[A-Za-z0-9.-]+\//.test(r.pay_url || "");
    pay.hidden = !ok;
    if (ok) pay.href = r.pay_url; else pay.removeAttribute("href");
    $("prizeRow").hidden = !prize;
    $("prizeText").textContent = prize;
  }

  function tick() {
    const r = current;
    if (!r) return;
    const now = Date.now(), p = phase(r, now);
    const labels = { before: ["ההרשמה פתוחה", "pill"], window: ["חלון הזינוק פתוח", "pill ok"], reporting: ["מדווחים תוצאות", "pill warn"], done: ["המרוץ הסתיים", "pill off"] };
    let label = labels[p];
    if (p === "before" && r.status !== "open") label = ["ההרשמה סגורה", "pill off"];
    $("racePhase").textContent = label[0];
    $("racePhase").className = label[1];

    const target = p === "before" ? startMs(r) : p === "window" ? endMs(r) : null;
    if (target) {
      $("countLabel").textContent = p === "before" ? "הזינוק נפתח בעוד" : "חלון הזינוק נסגר בעוד";
      let s = Math.max(0, Math.floor((target - now) / 1000));
      $("cd").textContent = Math.floor(s / 86400); s %= 86400;
      $("ch").textContent = String(Math.floor(s / 3600)).padStart(2, "0"); s %= 3600;
      $("cm").textContent = String(Math.floor(s / 60)).padStart(2, "0");
      $("cs").textContent = String(s % 60).padStart(2, "0");
    }
    $("countBox").hidden = !target;
    renderMine(p);
  }

  /* ---------- me in this race ---------- */
  function renderMine(p) {
    const r = current;
    const joined = !!(me && mine && mine.registered);
    const canJoin = r.status === "open" && (p === "before" || p === "window");
    // Until my_result() answers we do not know whether I already joined.
    const known = !me || mine !== null;
    $("joinCard").hidden = joined || !canJoin || !known;
    $("joinNeed").hidden = !!me;
    $("joinBtn").hidden = !me;
    $("meCard").hidden = !joined;
    if (!joined) return;

    $("meHello").textContent = "נרשמת למרוץ, " + me.name + ".";
    const st = mine.status;
    const formOpen = !$("finishForm").hidden;
    const canReport = (p === "window" || p === "reporting") && st !== "approved";
    const hint = $("meHint"), status = $("meStatus");

    if (p === "before") hint.textContent = "בבוקר המרוץ: מקליטים את הריצה בשעון או ב-Strava, רצים " + fmtKm(r.distance_km) + " וחוזרים לכאן כדי לדווח.";
    else if (st === "none") hint.textContent = p === "done" ? "הזמן לדיווח תוצאות נגמר." : "סיימת לרוץ? לוחצים על הכפתור ושולחים את הלינק לפעילות.";
    else hint.textContent = "";
    hint.hidden = !hint.textContent;

    $("finishBtn").hidden = !(canReport && st === "none" && !formOpen);
    $("finEdit").hidden = !(canReport && (st === "pending" || st === "rejected") && !formOpen);

    if (st === "pending") {
      status.className = "notice warn";
      status.textContent = "התוצאה שלך (" + fmtTime(mine.claimed_seconds) + ") נשלחה ומחכה לבדיקה של הראל.";
    } else if (st === "approved") {
      status.className = "notice ok";
      status.textContent = "התוצאה אושרה: " + fmtTime(mine.final_seconds) + ". כל הכבוד!";
    } else if (st === "rejected") {
      status.className = "notice bad";
      status.textContent = "התוצאה לא אושרה." + (mine.admin_note ? " הסיבה: " + mine.admin_note : "");
    }
    status.hidden = !(st === "pending" || st === "approved" || st === "rejected");
  }

  async function loadMine(r) {
    if (!me) return;
    const { data, error } = await client.rpc("my_result", { p_race: r.id, p_runner: me.id, p_token: me.token });
    if (current !== r || error || !data) return;
    if (data.user === false) { store.del(ME_KEY); me = null; mine = null; renderProfile(); }
    else mine = data;
    tick();
    markMe();
  }

  $("joinBtn").addEventListener("click", async () => {
    const r = current, btn = $("joinBtn"), err = $("joinErr");
    if (!me) return;
    showErr(err, ""); btn.disabled = true; btn.textContent = "רושם...";
    const { data, error } = await client.rpc("join_race", { p_race: r.id, p_runner: me.id, p_token: me.token });
    btn.disabled = false; btn.textContent = "אני בפנים";
    if (error || !data) return showErr(err, errorText(error));
    if (current !== r) return;
    mine = { user: true, registered: true, status: "none" };
    tick();
    loadRunners(r);
  });

  /* ---------- finishing ---------- */
  function openFinish() {
    showErr($("finErr"), "");
    $("finishForm").hidden = false;
    tick();
    $("finTime").focus();
  }
  $("finishBtn").addEventListener("click", openFinish);
  $("finEdit").addEventListener("click", openFinish);
  $("finCancel").addEventListener("click", () => { $("finishForm").hidden = true; tick(); });

  $("finishForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const r = current, err = $("finErr"), btn = $("finSend");
    const seconds = parseTime($("finTime").value);
    const url = $("finUrl").value.trim();
    if (!seconds) return showErr(err, "כתבו את הזמן בצורה דקות:שניות, למשל 24:31.");
    if (!isActivityUrl(url)) return showErr(err, errorText({ message: "BAD_LINK" }));
    showErr(err, ""); btn.disabled = true; btn.textContent = "שולח...";
    const { error } = await client.rpc("submit_result", {
      p_race: r.id, p_runner: me.id, p_token: me.token, p_strava_url: url, p_seconds: seconds
    });
    btn.disabled = false; btn.textContent = "שליחת התוצאה";
    if (error) return showErr(err, errorText(error));
    mine = { user: true, registered: true, status: "pending", claimed_seconds: seconds };
    $("finishForm").hidden = true;
    $("finishForm").reset();
    tick();
  });

  /* ---------- runners and leaderboard ---------- */
  async function loadRunners(r) {
    const { data, error } = await client.rpc("race_runners", { p_race: r.id });
    if (current !== r || error || !data) return;
    $("raceCount").textContent = String(data.length);
    const box = $("runners");
    clear(box);
    const MAX = 60;
    data.slice(0, MAX).forEach(x => box.append(el("span", "chip", x.name + " · " + x.city)));
    if (data.length > MAX) box.append(el("span", "chip", "ועוד " + (data.length - MAX)));
    $("runnersCard").hidden = data.length === 0;
  }

  let board = [];
  function renderBoard(list) {
    board = list;
    const pod = $("podium");
    clear(pod);
    [[1, "p2"], [0, "p1"], [2, "p3"]].forEach(([idx, cls]) => {
      const x = list[idx];
      const box = el("div", "pod " + cls + (x ? "" : " empty"));
      const initials = x ? x.name.split(" ").slice(0, 2).map(w => w.charAt(0)).join("") : "";
      const head = el("div", "podhead");
      head.append(el("div", "av", initials), el("div", "who", x ? x.name : (idx === 0 ? "מחכה לך" : "פנוי")));
      if (x) head.append(el("div", "city", x.city), el("div", "t", fmtTime(x.seconds)));
      box.append(head, el("div", "block", idx + 1));
      pod.append(box);
    });
    const body = $("boardBody");
    clear(body);
    list.forEach((x, i) => {
      const tr = el("tr");
      tr.append(el("td", "n", i + 1), el("td", "", x.name), el("td", "", x.city),
        el("td", "n", fmtTime(x.seconds)), el("td", "n", fmtTime(x.seconds / Number(current.distance_km))));
      body.append(tr);
    });
    $("boardWrap").hidden = list.length === 0;
    $("boardState").textContent = list.length
      ? list.length + " תוצאות מאושרות. רק תוצאות שנבדקו מופיעות כאן."
      : "התוצאות יופיעו כאן אחרי שהראל יאשר אותן.";
    markMe();
  }

  function markMe() {
    const on = me && mine && mine.status === "approved";
    Array.from($("boardBody").children).forEach((tr, i) => {
      const x = board[i];
      tr.className = on && x && x.name === me.name && x.city === me.city && x.seconds === mine.final_seconds ? "me" : "";
    });
  }

  async function loadBoard(r) {
    const { data, error } = await client.rpc("leaderboard", { p_race: r.id });
    if (current !== r) return;
    if (error) { $("boardState").textContent = "לא הצלחנו לטעון את התוצאות כרגע."; return; }
    renderBoard(data || []);
  }

  // Keep the board and my status fresh while the page is open and visible.
  setInterval(() => {
    if (!current || document.hidden || !client) return;
    loadRunners(current);
    if (phase(current, Date.now()) === "before") return;
    loadBoard(current); loadMine(current);
  }, 60000);

  init();
})();
