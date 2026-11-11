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

  // Only links to the sites runners record on are accepted or turned into clickable links.
  // Must match valid_activity_url() in schema.sql.
  const ACTIVITY_URL = /^https:\/\/(www\.strava\.com|strava\.com|strava\.app\.link|connect\.garmin\.com|flow\.polar\.com|(www\.|maps\.)?suunto\.com|([a-z0-9-]+\.)?coros\.com)\/[A-Za-z0-9_=&%.?\/#~+-]{1,170}$/;
  function isActivityUrl(u) { return typeof u === "string" && u.length <= 200 && ACTIVITY_URL.test(u); }
  function activitySite(u) {
    if (!isActivityUrl(u)) return "";
    const h = new URL(u).hostname;
    if (h.indexOf("strava") !== -1) return "Strava";
    if (h.indexOf("garmin") !== -1) return "Garmin";
    if (h.indexOf("polar") !== -1) return "Polar";
    if (h.indexOf("suunto") !== -1) return "Suunto";
    return "COROS";
  }

  const ERRORS = {
    RACE_CLOSED: "ההרשמה למרוץ הזה סגורה.",
    NO_USER: "לא מצאנו את המשתמש שלכם במכשיר הזה. צרו משתמש מחדש.",
    SITE_FULL: "אי אפשר ליצור משתמשים חדשים כרגע. פנו להראל בקהילה.",
    RACE_FULL: "המרוץ מלא, אין יותר מקומות.",
    BAD_INPUT: "שם ועיר צריכים להיות באורך 2 עד 40 תווים, באותיות בלבד.",
    TOO_MANY: "נוצרו יותר מדי משתמשים מהרשת הזו בשעה האחרונה. נסו שוב מאוחר יותר.",
    DUPLICATE: "כבר יש רץ רשום עם השם והעיר האלה. אם זה לא אתם, הוסיפו שם משפחה.",
    NOT_REGISTERED: "אתם לא רשומים למרוץ הזה.",
    NOT_STARTED: "אפשר לדווח תוצאה רק אחרי שחלון הזינוק נפתח.",
    TOO_LATE: "הזמן לדיווח תוצאות למרוץ הזה נגמר.",
    BAD_LINK: "הלינק צריך להיות לינק לפעילות מ-Strava, Garmin, Polar, Suunto או COROS, ולהתחיל ב-https.",
    TOO_EARLY: "לפי הזמן שכתבתם, עוד לא יכולתם לסיים: חלון הזינוק נפתח לפני פחות זמן מזה. בדקו את הזמן.",
    DUP_LINK: "הלינק הזה כבר נשלח על ידי רץ אחר במרוץ הזה.",
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

  window.TH = { cfg, client, configured, $, el, clear, parseTime, fmtTime, fmtDate, fmtClock, fmtKm, isActivityUrl, activitySite, errorText, store };
})();
