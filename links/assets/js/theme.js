/*
 * theme.js — מעבר חשוך/בהיר משותף.
 * ברירת המחדל עוקבת אחרי הגדרות המערכת; ברגע שהמשתמש בוחר ידנית,
 * הבחירה נשמרת ב-localStorage וגוברת על הגדרת המערכת.
 *
 * הערה: קוד קטן ב-<head> של כל עמוד כבר מחיל את הבחירה השמורה לפני הציור
 * כדי למנוע הבהוב. הקובץ הזה מטפל בכפתור ההחלפה ובעדכון theme-color.
 */
(function () {
  const cfg = window.LINKHUB_CONFIG;
  const KEY = cfg ? cfg.themeKey : "linkhub:theme";
  const root = document.documentElement;
  const mq = window.matchMedia("(prefers-color-scheme: light)");

  function stored() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function effective() {
    const t = root.dataset.theme;
    if (t === "light" || t === "dark") return t;
    return mq.matches ? "light" : "dark";
  }

  function updateMeta() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
    if (bg) meta.setAttribute("content", bg);
  }

  function apply(theme) {
    if (theme === "light" || theme === "dark") root.dataset.theme = theme;
    else delete root.dataset.theme;
    // מחכים לפריים כדי שהמשתנים החדשים ייכנסו לתוקף לפני קריאת --bg
    requestAnimationFrame(updateMeta);
  }

  function toggle() {
    const next = effective() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch (e) {}
    apply(next);
  }

  // אם המשתמש לא בחר ידנית — לעקוב אחרי שינוי בהגדרות המערכת בזמן אמת
  mq.addEventListener("change", function () {
    if (!stored()) updateMeta();
  });

  document.addEventListener("DOMContentLoaded", function () {
    updateMeta();
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.addEventListener("click", toggle);
    });
  });

  window.LINKHUB_THEME = { toggle: toggle, apply: apply, effective: effective };
})();
