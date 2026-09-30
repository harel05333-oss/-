# העלאת האתר לאוויר וחיבור דומיין

## שלב 1 – הפעלה חד-פעמית של GitHub Pages

1. ב-GitHub: **Settings ← Pages**.
2. תחת **Build and deployment ← Source** לבחור **GitHub Actions**.
3. למזג את הענף `claude/nutrition-runners-site-pn4cd3` ל-`main`.

מעכשיו, כל שינוי בתיקייה `nutrition/` שנכנס ל-`main` מעלה את האתר אוטומטית (תוך 1-2 דקות).
הכתובת החינמית: **https://harel05333-oss.github.io/-/**

אפשר לראות את מצב ההעלאה בלשונית **Actions** ← "Deploy site".

## שלב 2 – דומיין משלך (כשיהיה)

### קנייה
- `.co.il` – אצל רשם ישראלי מוסמך (למשל LiveDNS, דומיין דה נט, Interspace). בערך 60-100 ₪ לשנה.
- `.com` – Cloudflare Registrar / Namecheap / Porkbun. בערך 10-15$ לשנה.

רעיונות לשם: `harelrun.co.il`, `harel-run.com`, `runfuel.co.il`, `harelbenezra.co.il`.

### חיבור
1. **ב-DNS של הרשם** להגדיר:

   | סוג | שם | ערך |
   |-----|-----|-----|
   | A | @ | 185.199.108.153 |
   | A | @ | 185.199.109.153 |
   | A | @ | 185.199.110.153 |
   | A | @ | 185.199.111.153 |
   | CNAME | www | harel05333-oss.github.io |

2. **ב-GitHub: Settings ← Pages ← Custom domain** – להזין את הדומיין (למשל `harelrun.co.il`) ולשמור.
3. לחכות שהבדיקה תעבור (דקות עד כמה שעות), ואז לסמן **Enforce HTTPS**.
4. לעדכן באתר את הכתובת הישנה `https://harel05333-oss.github.io/-/` בכתובת החדשה בקבצים:
   - `index.html` – התגיות `canonical`, `og:url`, `og:image`
   - `robots.txt`, `sitemap.xml`
   - `404.html` – הקישורים `/-/` הופכים ל-`/`

   (או פשוט לבקש מ-Claude: "חבר את הדומיין X".)

## אחרי העלייה לאוויר
- **Google Search Console** – להוסיף את האתר ולשלוח את `sitemap.xml`, כדי שיופיע בגוגל.
- **בדיקת תצוגה מקדימה בוואטסאפ/פייסבוק** – לשלוח את הקישור לעצמך; אמורה להופיע תמונת השיתוף (`og-image.png`).
