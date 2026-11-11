// Shared helpers for the public page and the admin page.
// All user-supplied text is written with textContent, never as HTML.
(function () {
  "use strict";
  const cfg = window.RACE_CONFIG || {};
  const TZ = "Asia/Jerusalem";

  const configured =
    /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl || "") &&
    typeof cfg.supabaseAnonKey === "string" && cfg.supabaseAnonKey.length > 20;

  let client = null;
  if (configured && window.supabase && window.supabase.createClient) {
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  }

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // "24:31" or "1:02:03" -> seconds, otherwise null.
  function parseTime(s) {
    const m = String(s || "").trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    if (+m[3] > 59 || (m[1] !== undefined && +m[2] > 59)) return null;
    const sec = (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]);
    return sec > 0 ? sec : null;
  }

  function fmtTime(sec) {
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(s).padStart(2, "0");
  }

  function fmtDate(iso) {
    return new Intl.DateTimeFormat("he-IL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" })
      .format(new Date(iso));
  }

  function fmtClock(iso) {
    return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false })
      .format(new Date(iso));
  }

  function fmtKm(n) {
    const v = Number(n);
    return (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "")) + " ק\"מ";
  }

  // Only real Strava activity links are ever turned into clickable links.
  function isStravaUrl(u) {
    return /^https:\/\/(www\.)?strava\.com\/activities\/[0-9]+([/?][A-Za-z0-9_=&%.\/-]*)?$/.test(u) ||
           /^https:\/\/strava\.app\.link\/[A-Za-z0-9_-]+$/.test(u);
  }

  const ERRORS = {
    RACE_CLOSED: "ההרשמה למרוץ הזה סגורה.",
    RACE_FULL: "המרוץ מלא, אין יותר מקומות.",
    BAD_INPUT: "שם ועיר צריכים להיות באורך 2 עד 40 תווים, באותיות בלבד.",
    TOO_MANY: "נרשמו יותר מדי רצים מהרשת הזו. פנו להראל בקהילה.",
    DUPLICATE: "כבר יש רץ רשום עם השם והעיר האלה. אם זה לא אתם, הוסיפו שם משפחה.",
    NOT_REGISTERED: "לא מצאנו את ההרשמה שלכם במכשיר הזה.",
    NOT_STARTED: "אפשר לדווח תוצאה רק אחרי שחלון הזינוק נפתח.",
    TOO_LATE: "הזמן לדיווח תוצאות למרוץ הזה נגמר.",
    BAD_LINK: "הלינק צריך להיות לינק לפעילות ב-Strava, למשל https://www.strava.com/activities/123456",
    BAD_TIME: "הזמן שהוזן לא מתאים למרחק של המרוץ. בדקו אותו שוב.",
    ALREADY_APPROVED: "התוצאה שלכם כבר אושרה ואי אפשר לשנות אותה."
  };

  function errorText(err) {
    const msg = (err && err.message) || "";
    for (const code in ERRORS) if (msg.indexOf(code) !== -1) return ERRORS[code];
    return "משהו השתבש. בדקו את החיבור לאינטרנט ונסו שוב.";
  }

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  window.TH = { cfg, client, configured, $, el, clear, parseTime, fmtTime, fmtDate, fmtClock, fmtKm, isStravaUrl, errorText, store };
})();
