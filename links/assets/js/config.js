/*
 * config.js — הגדרות בסיס משותפות לעמוד הציבורי ולאדמין.
 *
 * מזהה אוטומטית את ה-repo מתוך כתובת האתר, כך שאין צורך לערוך כאן כלום
 * גם אם משנים את שם התיקייה או משכפלים לחשבון אחר.
 *
 * דוגמה: כשהאתר מוגש מ-https://eitanisrael.github.io/links/
 *   owner    = "eitanisrael"
 *   repo     = "eitanisrael.github.io"
 *   dir      = "/links/"
 *   dataPath = "links/data/links.json"   (הנתיב בתוך ה-repo)
 */
window.LINKHUB_CONFIG = (function () {
  const host = location.hostname.toLowerCase();

  // זיהוי חשבון ה-User/Org Pages מתוך הדומיין (name.github.io)
  let owner = "";
  let repo = "";
  const m = host.match(/^([^.]+)\.github\.io$/);
  if (m) {
    owner = m[1];
    repo = host; // עבור User Pages, שם ה-repo זהה לדומיין
  }

  // תיקיית הבסיס של האפליקציה (זו שמכילה את index.html), עם / בהתחלה ובסוף
  let dir = location.pathname.replace(/[^/]*$/, "");
  if (!dir.endsWith("/")) dir += "/";

  // הנתיב לקובץ הנתונים בתוך ה-repo (בלי / מוביל)
  const repoDir = dir.replace(/^\/+/, "");
  const dataPath = repoDir + "data/links.json";

  return {
    owner: owner,
    repo: repo,
    branch: "main",
    dir: dir,
    dataPath: dataPath,
    apiBase: "https://api.github.com",
    // מפתחות אחסון מקומי (מרחב־שם לפי ה-repo כדי למנוע התנגשויות)
    tokenKey: "linkhub:" + host + ":token",
    themeKey: "linkhub:theme",
    // האם אנחנו רצים על GitHub (יש owner) או בבדיקה מקומית
    get isGitHub() {
      return Boolean(this.owner && this.repo);
    },
  };
})();
