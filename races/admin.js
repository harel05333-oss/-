// Admin page. Everything here is also enforced by the database:
// a visitor who is not in the admins table gets nothing back, whatever this file does.
(function () {
  "use strict";
  const { client, configured, $, el, clear, parseTime, fmtTime, fmtDate, fmtClock, fmtKm, isActivityUrl, activitySite } = window.TH;

  let races = [];
  let runners = {};       // runner id -> { name, city, created_at }
  let current = null;
  let editingId = null;
  const stamp = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

  function setState(text, kind) {
    const s = $("adminState");
    if (!text) { s.hidden = true; return; }
    s.className = "notice " + (kind || "info");
    s.textContent = text;
    s.hidden = false;
  }
  function showErr(node, text) { node.textContent = text; node.hidden = !text; }

  const STATUS = { draft: ["טיוטה", "pill off"], open: ["פתוח", "pill ok"], closed: ["סגור", "pill warn"] };

  /* ---------- session ---------- */
  async function start() {
    if (!configured || !client) {
      setState("האתר עוד לא מחובר למסד הנתונים. צריך למלא את config.js לפי ההוראות ב-SETUP.md.", "warn");
      return;
    }
    const { data } = await client.auth.getSession();
    if (data && data.session) await enter(); else showLogin();
  }

  function showLogin() {
    setState("");
    $("adminApp").hidden = true;
    $("logoutBtn").hidden = true;
    $("loginCard").hidden = false;
  }

  async function enter() {
    const { data, error } = await client.rpc("is_admin");
    if (error || data !== true) {
      await client.auth.signOut();
      showLogin();
      showErr($("logErr"), "לחשבון הזה אין הרשאת מנהל.");
      return;
    }
    $("loginCard").hidden = true;
    $("logoutBtn").hidden = false;
    $("adminApp").hidden = false;
    setState("");
    await loadUsers();
    await loadRaces();
    loadCode();
  }

  /* ---------- community code ---------- */
  async function loadCode() {
    const { data, error } = await client.from("settings").select("join_code").eq("id", true);
    if (error || !data || !data.length) { $("codeCard").hidden = true; return; }   // database not upgraded yet
    const code = data[0].join_code;
    $("codeState").textContent = code ? "הקוד הנוכחי: " + code : "אין קוד כרגע. כל מי שיש לו את הלינק יכול ליצור משתמש.";
    $("codeClear").hidden = !code;
    $("codeCard").hidden = false;
  }
  async function saveCode(value) {
    const { error } = await client.from("settings").update({ join_code: value }).eq("id", true);
    if (error) return showErr($("codeErr"), "השמירה נכשלה. נסו שוב.");
    showErr($("codeErr"), "");
    $("codeInput").value = "";
    loadCode();
  }
  $("codeForm").addEventListener("submit", ev => {
    ev.preventDefault();
    const v = $("codeInput").value.trim();
    if (!/^[A-Za-z0-9א-ת_-]{4,40}$/.test(v)) return showErr($("codeErr"), "הקוד צריך להיות באורך 4 עד 40 תווים, אותיות וספרות בלבד.");
    saveCode(v);
  });
  $("codeClear").addEventListener("click", () => saveCode(null));

  /* ---------- users ---------- */
  async function loadUsers() {
    const { data, error } = await client.from("runners").select("id,name,city,created_at").order("created_at", { ascending: false });
    if (error) return showErr($("usersErr"), "לא הצלחנו לטעון את רשימת המשתמשים.");
    showErr($("usersErr"), "");
    runners = {};
    data.forEach(u => { runners[u.id] = u; });
    $("userCount").textContent = String(data.length);
    $("usersEmpty").hidden = data.length > 0;
    $("usersToggle").hidden = data.length === 0;
    const body = $("usersBody");
    clear(body);
    data.forEach(u => {
      const tr = el("tr");
      const act = el("td");
      const del = el("button", "linkbtn small", "מחיקה"); del.type = "button";
      const sure = el("button", "linkbtn small", "בטוח? למחוק כולל התוצאות שלו"); sure.type = "button"; sure.hidden = true;
      del.addEventListener("click", () => { del.hidden = true; sure.hidden = false; });
      sure.addEventListener("click", async () => {
        const { error: e2 } = await client.from("runners").delete().eq("id", u.id);
        if (e2) return showErr($("usersErr"), "המחיקה נכשלה. נסו שוב.");
        await loadUsers();
        if (current) loadRaceData();
      });
      act.append(del, sure);
      tr.append(el("td", "", u.name), el("td", "", u.city), el("td", "n small", stamp.format(new Date(u.created_at))), act);
      body.append(tr);
    });
  }
  $("usersToggle").addEventListener("click", () => {
    const w = $("usersWrap");
    w.hidden = !w.hidden;
    $("usersToggle").textContent = w.hidden ? "הצגת הרשימה" : "הסתרת הרשימה";
  });

  $("loginForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const btn = $("logBtn");
    showErr($("logErr"), "");
    btn.disabled = true;
    const { error } = await client.auth.signInWithPassword({
      email: $("logEmail").value.trim(), password: $("logPass").value
    });
    btn.disabled = false;
    $("logPass").value = "";
    if (error) { showErr($("logErr"), "האימייל או הסיסמה לא נכונים."); return; }
    await enter();
  });

  $("logoutBtn").addEventListener("click", async () => {
    await client.auth.signOut();
    current = null;
    $("raceAdmin").hidden = true;
    showLogin();
  });

  /* ---------- races ---------- */
  async function loadRaces(selectId) {
    const { data, error } = await client.from("races")
      .select("*,starts_at,ends_at")
      .order("race_date", { ascending: false });
    if (error) { setState("לא הצלחנו לטעון את המרוצים. נסו לרענן.", "bad"); return; }
    races = data || [];
    const box = $("adminRaces");
    clear(box);
    races.forEach(r => {
      const b = el("button", "raceitem");
      b.type = "button";
      b.setAttribute("aria-current", String(current && current.id === r.id));
      const st = STATUS[r.status];
      b.append(el("b", "", r.title), el("span", "small muted", fmtDate(r.starts_at) + " · " + fmtKm(r.distance_km)), el("span", st[1], st[0]));
      b.addEventListener("click", () => openRace(r));
      box.append(b);
    });
    $("noRaces").hidden = races.length > 0;
    const again = races.find(r => r.id === (selectId || (current && current.id)));
    if (again) openRace(again); else { current = null; $("raceAdmin").hidden = true; }
  }

  function openForm(r) {
    editingId = r ? r.id : null;
    $("raceFormTitle").textContent = r ? "עריכת מרוץ" : "מרוץ חדש";
    $("rfTitle").value = r ? r.title : "";
    $("rfDate").value = r ? r.race_date : "";
    $("rfKm").value = r ? Number(r.distance_km) : 5;
    $("rfStart").value = r ? r.window_start.slice(0, 5) : "06:00";
    $("rfEnd").value = r ? r.window_end.slice(0, 5) : "08:00";
    $("rfMax").value = r ? r.max_runners : 500;
    $("rfStatus").value = r ? r.status : "draft";
    $("rfFee").value = r ? (Number(r.fee_ils) || 0) : 0;
    $("rfPay").value = r ? (r.pay_url || "") : "";
    $("rfPrize").value = r ? (r.prize || "") : "";
    showErr($("rfErr"), "");
    $("raceFormCard").hidden = false;
    $("raceFormCard").scrollIntoView({ block: "start" });
    $("rfTitle").focus();
  }
  $("newRaceBtn").addEventListener("click", () => openForm(null));
  $("rfCancel").addEventListener("click", () => { $("raceFormCard").hidden = true; });
  $("raEdit").addEventListener("click", () => openForm(current));

  $("raceForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const err = $("rfErr");
    const row = {
      title: $("rfTitle").value.trim().replace(/\s+/g, " "),
      race_date: $("rfDate").value,
      window_start: $("rfStart").value,
      window_end: $("rfEnd").value,
      distance_km: Number($("rfKm").value),
      max_runners: Number($("rfMax").value),
      status: $("rfStatus").value,
      fee_ils: Number($("rfFee").value) || 0,
      pay_url: $("rfPay").value.trim() || null,
      prize: $("rfPrize").value.trim().replace(/\s+/g, " ") || null
    };
    if (row.title.length < 2) return showErr(err, "צריך לתת שם למרוץ.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.race_date)) return showErr(err, "צריך לבחור תאריך.");
    if (!row.window_start || !row.window_end || row.window_end <= row.window_start) return showErr(err, "שעת הסגירה צריכה להיות אחרי שעת הפתיחה.");
    if (!(row.distance_km > 0 && row.distance_km <= 100)) return showErr(err, "המרחק צריך להיות בין 0.5 ל-100 ק\"מ.");
    if (!(Number.isInteger(row.max_runners) && row.max_runners >= 1 && row.max_runners <= 5000)) return showErr(err, "מקסימום הרצים צריך להיות בין 1 ל-5000.");
    if (!(Number.isInteger(row.fee_ils) && row.fee_ils >= 0 && row.fee_ils <= 10000)) return showErr(err, "דמי ההשתתפות צריכים להיות מספר שלם בין 0 ל-10000.");
    if (row.pay_url && !/^https:\/\/[A-Za-z0-9.-]+\//.test(row.pay_url)) return showErr(err, "הלינק לתשלום צריך להתחיל ב-https://");
    showErr(err, "");
    const btn = $("rfSave");
    btn.disabled = true;
    const q = editingId
      ? client.from("races").update(row).eq("id", editingId).select("id").single()
      : client.from("races").insert(row).select("id").single();
    const { data, error } = await q;
    btn.disabled = false;
    if (error || !data) return showErr(err, "השמירה נכשלה. בדקו את הנתונים ונסו שוב.");
    $("raceFormCard").hidden = true;
    await loadRaces(data.id);
  });

  /* ---------- one race ---------- */
  function openRace(r) {
    current = r;
    Array.from($("adminRaces").children).forEach((b, i) => b.setAttribute("aria-current", String(races[i].id === r.id)));
    $("raTitle").textContent = r.title;
    const st = STATUS[r.status];
    $("raStatus").textContent = st[0];
    $("raStatus").className = st[1];
    $("raMeta").textContent = fmtDate(r.starts_at) + " · " + fmtClock(r.starts_at) + "–" + fmtClock(r.ends_at) + " · " + fmtKm(r.distance_km);
    resetDelete();
    showErr($("raErr"), "");
    $("raceAdmin").hidden = false;
    loadRaceData();
  }
  $("raRefresh").addEventListener("click", async () => { await loadUsers(); loadRaceData(); });

  function resetDelete() {
    $("raDelete").hidden = false; $("raDeleteYes").hidden = true; $("raDeleteNo").hidden = true;
  }
  $("raDelete").addEventListener("click", () => {
    $("raDelete").hidden = true; $("raDeleteYes").hidden = false; $("raDeleteNo").hidden = false;
  });
  $("raDeleteNo").addEventListener("click", resetDelete);
  $("raDeleteYes").addEventListener("click", async () => {
    const { error } = await client.from("races").delete().eq("id", current.id);
    if (error) { resetDelete(); return showErr($("raErr"), "המחיקה נכשלה. נסו שוב."); }
    current = null;
    await loadRaces();
  });

  function stravaLink(url) {
    if (!isActivityUrl(url)) return el("span", "muted small", "לינק לא תקין");
    const a = el("a", "", "פתיחה ב-" + activitySite(url));
    a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
    return a;
  }

  async function loadRaceData() {
    const r = current;
    if (!r) return;
    const [regs, res] = await Promise.all([
      client.from("registrations").select("id,runner_id,created_at,paid").eq("race_id", r.id).order("created_at"),
      client.from("results").select("registration_id,strava_url,claimed_seconds,final_seconds,status,admin_note,submitted_at,flags").eq("race_id", r.id).order("submitted_at")
    ]);
    if (current !== r) return;
    if (regs.error || res.error) return showErr($("raErr"), "לא הצלחנו לטעון את נתוני המרוץ. לחצו על רענון.");
    showErr($("raErr"), "");
    const byId = {};
    regs.data.forEach(g => {
      const u = runners[g.runner_id] || { name: "?", city: "" };
      g.name = u.name; g.city = u.city;
      byId[g.id] = g;
    });
    const rows = res.data.map(x => Object.assign({ reg: byId[x.registration_id] || { name: "?", city: "" } }, x));
    renderPending(rows.filter(x => x.status === "pending"));
    renderDone(rows.filter(x => x.status !== "pending"));
    renderRegs(regs.data);
  }

  async function review(row, patch, errNode) {
    patch.reviewed_at = new Date().toISOString();
    const { error } = await client.from("results").update(patch).eq("registration_id", row.registration_id);
    if (error) return showErr(errNode, "העדכון נכשל. נסו שוב.");
    loadRaceData();
  }

  function renderPending(list) {
    const box = $("pendList");
    clear(box);
    $("pendCount").textContent = String(list.length);
    $("pendEmpty").hidden = list.length > 0;
    list.forEach((x, i) => {
      const card = el("div", "sub");
      const head = el("div", "row between");
      head.append(el("span", "who", x.reg.name + " · " + x.reg.city), stravaLink(x.strava_url));
      const pace = fmtTime(x.claimed_seconds / Number(current.distance_km));
      const info = el("p", "small muted", "דיווח: " + fmtTime(x.claimed_seconds) + " (קצב " + pace + " לק\"מ)");

      // What the database already verified when the result came in, and what is left for a person.
      const fast = (x.flags || []).indexOf("FAST_PACE") !== -1;
      const checks = el("ul", "checks");
      const line = (cls, text) => { const li = el("li", cls, text); checks.append(li); };
      line("ok", "הלינק מ-" + activitySite(x.strava_url) + ", ולא נשלח על ידי רץ אחר");
      line("ok", "נשלח ב-" + fmtClock(x.submitted_at) + ", אחרי שאפשר היה לסיים ריצה כזאת");
      line(fast ? "warn" : "ok", fast ? "קצב מהיר מ-3:00 לק\"מ: נדיר מאוד, לבדוק היטב" : "הקצב הגיוני: " + pace + " לק\"מ");
      line("todo", "לבדוק בפעילות: התאריך, ושעת ההתחלה בין " + fmtClock(current.starts_at) + " ל-" + fmtClock(current.ends_at));
      line("todo", "לבדוק בפעילות: המרחק לפחות " + fmtKm(current.distance_km));
      line("todo", "לבדוק בפעילות: הזמן הכולל (Elapsed time) הוא " + fmtTime(x.claimed_seconds));

      const fields = el("div", "inline");
      const fTime = el("div", "field");
      const tId = "pt" + i, nId = "pn" + i;
      const tLab = el("label", "", "זמן סופי"); tLab.htmlFor = tId;
      const tIn = el("input", "ltr num"); tIn.id = tId; tIn.value = fmtTime(x.claimed_seconds); tIn.maxLength = 8; tIn.inputMode = "numeric";
      fTime.append(tLab, tIn);
      const fNote = el("div", "field");
      const nLab = el("label", "", "סיבת דחייה (לרץ)"); nLab.htmlFor = nId;
      const nIn = el("input"); nIn.id = nId; nIn.maxLength = 200; nIn.placeholder = "למשל: ההתחלה מחוץ לחלון הזינוק";
      fNote.append(nLab, nIn);
      fields.append(fTime, fNote);

      const err = el("p", "notice bad"); err.hidden = true;
      const btns = el("div", "row");
      const ok = el("button", "btn sm go", "אישור"); ok.type = "button";
      const no = el("button", "btn sm danger", "דחייה"); no.type = "button";
      ok.addEventListener("click", () => {
        const sec = parseTime(tIn.value);
        if (!sec) return showErr(err, "כתבו את הזמן הסופי בצורה דקות:שניות, למשל 24:31.");
        review(x, { status: "approved", final_seconds: sec, admin_note: null }, err);
      });
      no.addEventListener("click", () => {
        const note = nIn.value.trim();
        if (note.length < 3) return showErr(err, "כתבו לרץ בקצרה למה התוצאה נדחתה.");
        review(x, { status: "rejected", final_seconds: null, admin_note: note }, err);
      });
      btns.append(ok, no);
      card.append(head, info, checks, fields, err, btns);
      box.append(card);
    });
  }

  function renderDone(list) {
    const body = $("doneBody");
    clear(body);
    $("doneEmpty").hidden = list.length > 0;
    list.sort((a, b) => (a.status === b.status ? (a.final_seconds || 0) - (b.final_seconds || 0) : a.status === "approved" ? -1 : 1));
    list.forEach(x => {
      const tr = el("tr");
      const ok = x.status === "approved";
      const st = el("td"); st.append(el("span", ok ? "pill ok" : "pill bad", ok ? "מאושר" : "נדחה"));
      if (!ok && x.admin_note) st.append(el("div", "small muted", x.admin_note));
      const link = el("td"); link.append(stravaLink(x.strava_url));
      const act = el("td");
      const back = el("button", "linkbtn small", "החזרה לבדיקה"); back.type = "button";
      back.addEventListener("click", () => review(x, { status: "pending", final_seconds: null, admin_note: null }, $("raErr")));
      act.append(back);
      tr.append(el("td", "", x.reg.name), el("td", "", x.reg.city),
        el("td", "n", fmtTime(ok ? x.final_seconds : x.claimed_seconds)), st, link, act);
      body.append(tr);
    });
  }

  function renderRegs(list) {
    const body = $("regBody");
    clear(body);
    $("regCount").textContent = String(list.length);
    $("regEmpty").hidden = list.length > 0;
    list.forEach(g => {
      const tr = el("tr");
      const act = el("td");
      const del = el("button", "linkbtn small", "הסרה מהמרוץ"); del.type = "button";
      const sure = el("button", "linkbtn small", "בטוח? להסיר מהמרוץ"); sure.type = "button"; sure.hidden = true;
      del.addEventListener("click", () => { del.hidden = true; sure.hidden = false; });
      sure.addEventListener("click", async () => {
        const { error } = await client.from("registrations").delete().eq("id", g.id);
        if (error) return showErr($("raErr"), "ההסרה נכשלה. נסו שוב.");
        loadRaceData();
      });
      act.append(del, sure);
      const paidTd = el("td");
      const paid = el("input"); paid.type = "checkbox"; paid.checked = !!g.paid;
      paid.setAttribute("aria-label", "שילם: " + g.name);
      paid.addEventListener("change", async () => {
        paid.disabled = true;
        const { error } = await client.from("registrations").update({ paid: paid.checked }).eq("id", g.id);
        paid.disabled = false;
        if (error) { paid.checked = !paid.checked; showErr($("raErr"), "העדכון נכשל. נסו שוב."); }
      });
      paidTd.append(paid);
      tr.append(el("td", "", g.name), el("td", "", g.city), el("td", "n small", stamp.format(new Date(g.created_at))), paidTd, act);
      body.append(tr);
    });
  }

  start();
})();
