// Public page: list races, register, report a result, show the leaderboard.
(function () {
  "use strict";
  const { cfg, client, configured, $, el, clear, parseTime, fmtTime, fmtDate, fmtClock, fmtKm, errorText, store } = window.TH;
  const SUBMIT_GRACE_MS = 12 * 3600 * 1000; // must match submit_result() in schema.sql

  if (cfg.whatsappLink) $("waLink").href = cfg.whatsappLink;
  if (cfg.communityUrl) $("brandLink").href = cfg.communityUrl;

  let races = [];
  let current = null;      // the race on screen
  let myResult = null;     // result of my_result() for the race on screen
  let timer = null;

  const regKey = id => "th_race_" + id;
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

  async function init() {
    if (!configured || !client) {
      setState("האתר עדיין בהקמה. המרוץ הראשון יפורסם בקהילת הוואטסאפ.", "info");
      return;
    }
    const { data, error } = await client.from("races")
      .select("id,title,race_date,window_start,window_end,distance_km,status,starts_at,ends_at")
      .order("race_date", { ascending: true });
    if (error) { setState("לא הצלחנו לטעון את המרוצים. נסו לרענן בעוד כמה דקות.", "bad"); return; }
    races = data || [];
    if (!races.length) { setState("עוד אין מרוץ פתוח. המרוץ הבא יפורסם בקהילת הוואטסאפ.", "info"); return; }
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
    myResult = null;
    $("raceTitle").textContent = r.title;
    $("raceKm").textContent = fmtKm(r.distance_km);
    $("raceWindow").textContent = fmtClock(r.starts_at) + "–" + fmtClock(r.ends_at);
    $("raceDate").textContent = fmtDate(r.starts_at);
    $("raceCount").textContent = "0";
    $("finishForm").hidden = true;
    $("regErr").hidden = true;
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

  function tick() {
    const r = current;
    if (!r) return;
    const now = Date.now(), p = phase(r, now);
    const pill = $("racePhase");
    const labels = { before: ["ההרשמה פתוחה", "pill"], window: ["חלון הזינוק פתוח", "pill ok"], reporting: ["מדווחים תוצאות", "pill warn"], done: ["המרוץ הסתיים", "pill off"] };
    let label = labels[p];
    if (p === "before" && r.status !== "open") label = ["ההרשמה סגורה", "pill off"];
    pill.textContent = label[0];
    pill.className = label[1];

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
    renderMe(p);
  }

  /* ---------- registration and my state ---------- */
  function renderMe(p) {
    const r = current, reg = store.get(regKey(r.id));
    const canRegister = r.status === "open" && (p === "before" || p === "window");
    $("regCard").hidden = !!reg || !canRegister;
    $("meCard").hidden = !reg;
    if (!reg) return;

    $("meHello").textContent = "נרשמת, " + reg.name + ".";
    const st = myResult && myResult.status;
    const formOpen = !$("finishForm").hidden;
    const canReport = (p === "window" || p === "reporting") && st !== "approved";
    const hint = $("meHint"), status = $("meStatus");

    if (p === "before") hint.textContent = "בבוקר המרוץ: מפעילים את Strava, רצים " + fmtKm(r.distance_km) + " וחוזרים לכאן כדי לדווח.";
    else if (st === "none" || !st) hint.textContent = p === "done" ? "הזמן לדיווח תוצאות נגמר." : "סיימת לרוץ? לוחצים על הכפתור ושולחים את הלינק מ-Strava.";
    else hint.textContent = "";
    hint.hidden = !hint.textContent;

    $("finishBtn").hidden = !(canReport && (st === "none" || !st) && !formOpen);
    $("finEdit").hidden = !(canReport && (st === "pending" || st === "rejected") && !formOpen);

    if (st === "pending") {
      status.className = "notice warn";
      status.textContent = "התוצאה שלך (" + fmtTime(myResult.claimed_seconds) + ") נשלחה ומחכה לבדיקה של הראל.";
    } else if (st === "approved") {
      status.className = "notice ok";
      status.textContent = "התוצאה אושרה: " + fmtTime(myResult.final_seconds) + ". כל הכבוד!";
    } else if (st === "rejected") {
      status.className = "notice bad";
      status.textContent = "התוצאה לא אושרה." + (myResult.admin_note ? " הסיבה: " + myResult.admin_note : "");
    }
    status.hidden = !(st === "pending" || st === "approved" || st === "rejected");
  }

  async function loadMine(r) {
    const reg = store.get(regKey(r.id));
    if (!reg) return;
    const { data, error } = await client.rpc("my_result", { p_registration: reg.id, p_token: reg.token });
    if (current !== r || error || !data) return;
    if (data.registered === false) { store.del(regKey(r.id)); myResult = null; }
    else myResult = data;
    tick();
    if (myResult && myResult.status === "approved") markMe();
  }

  $("regForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const r = current, err = $("regErr"), btn = $("regBtn");
    const name = $("regName").value.trim().replace(/\s+/g, " ");
    const city = $("regCity").value.trim().replace(/\s+/g, " ");
    if (name.length < 2 || city.length < 2) {
      err.textContent = "צריך למלא שם ועיר כדי להירשם."; err.hidden = false; return;
    }
    err.hidden = true; btn.disabled = true; btn.textContent = "שולח...";
    const { data, error } = await client.rpc("register_runner", { p_race: r.id, p_name: name, p_city: city });
    btn.disabled = false; btn.textContent = "אני בפנים";
    if (error || !data) { err.textContent = errorText(error); err.hidden = false; return; }
    store.set(regKey(r.id), { id: data.registration_id, token: data.token, name: name });
    myResult = { registered: true, status: "none" };
    $("regForm").reset();
    tick();
    loadRunners(r);
  });

  /* ---------- finishing ---------- */
  function openFinish() {
    $("finErr").hidden = true;
    $("finishForm").hidden = false;
    tick();
    $("finTime").focus();
  }
  $("finishBtn").addEventListener("click", openFinish);
  $("finEdit").addEventListener("click", openFinish);
  $("finCancel").addEventListener("click", () => { $("finishForm").hidden = true; tick(); });

  $("finishForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const r = current, reg = store.get(regKey(r.id)), err = $("finErr"), btn = $("finSend");
    const seconds = parseTime($("finTime").value);
    const url = $("finUrl").value.trim();
    if (!seconds) { err.textContent = "כתבו את הזמן בצורה דקות:שניות, למשל 24:31."; err.hidden = false; return; }
    if (!window.TH.isStravaUrl(url)) { err.textContent = errorText({ message: "BAD_LINK" }); err.hidden = false; return; }
    err.hidden = true; btn.disabled = true; btn.textContent = "שולח...";
    const { error } = await client.rpc("submit_result", {
      p_registration: reg.id, p_token: reg.token, p_strava_url: url, p_seconds: seconds
    });
    btn.disabled = false; btn.textContent = "שליחת התוצאה";
    if (error) { err.textContent = errorText(error); err.hidden = false; return; }
    myResult = { registered: true, status: "pending", claimed_seconds: seconds };
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
      box.append(el("div", "n", idx + 1), el("div", "who", x ? x.name : (idx === 0 ? "מחכה לך" : "פנוי")));
      if (x) box.append(el("div", "city", x.city), el("div", "t", fmtTime(x.seconds)));
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
    const reg = current && store.get(regKey(current.id));
    if (!reg || !myResult || myResult.status !== "approved") return;
    Array.from($("boardBody").children).forEach((tr, i) => {
      const x = board[i];
      tr.className = x && x.name === reg.name && x.seconds === myResult.final_seconds ? "me" : "";
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
    if (phase(current, Date.now()) === "before") { loadRunners(current); return; }
    loadBoard(current); loadMine(current); loadRunners(current);
  }, 60000);

  init();
})();
