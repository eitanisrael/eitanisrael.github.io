/*
 * store.js — שכבת נתונים.
 *  • loadPublic()   — קריאה מהירה של הקובץ הסטטי (לעמוד הציבורי).
 *  • verify(token)  — בדיקת תקינות טוקן + הרשאת כתיבה ל-repo.
 *  • loadForEdit()  — קריאה טרייה דרך ה-API עם שמירת ה-sha (לאדמין).
 *  • save(data)     — commit של הנתונים חזרה ל-repo דרך GitHub Contents API.
 *  • token get/set/clear, uid, normalize.
 */
window.LINKHUB_STORE = (function () {
  const cfg = window.LINKHUB_CONFIG;
  let _sha = null; // ה-sha האחרון של קובץ הנתונים (נדרש ל-commit)

  /* ---------- עזרי Base64 עם תמיכה מלאה ב-UTF-8 (עברית) ---------- */
  function utf8ToB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  function b64ToUtf8(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function uid() {
    return crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  }

  /* ---------- נרמול מבנה הנתונים (הגנה מפני קובץ פגום/חלקי) ---------- */
  function normalize(data) {
    data = data && typeof data === "object" ? data : {};
    const p = data.profile && typeof data.profile === "object" ? data.profile : {};
    const out = {
      profile: {
        name: typeof p.name === "string" ? p.name : "",
        tagline: typeof p.tagline === "string" ? p.tagline : "",
        avatar:
          typeof p.avatar === "string" && p.avatar
            ? p.avatar
            : "./assets/icons/avatar.svg",
      },
      sections: [],
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
    };
    (Array.isArray(data.sections) ? data.sections : []).forEach(function (s) {
      if (!s || typeof s !== "object") return;
      out.sections.push({
        id: s.id || uid(),
        title: typeof s.title === "string" ? s.title : "",
        items: (Array.isArray(s.items) ? s.items : [])
          .filter(function (it) {
            return it && typeof it === "object";
          })
          .map(function (it) {
            return {
              id: it.id || uid(),
              title: typeof it.title === "string" ? it.title : "",
              url: typeof it.url === "string" ? it.url : "",
              description: typeof it.description === "string" ? it.description : "",
              icon: typeof it.icon === "string" ? it.icon : "",
              hidden: Boolean(it.hidden),
            };
          }),
      });
    });
    if (out.sections.length === 0) {
      out.sections.push({ id: uid(), title: "", items: [] });
    }
    return out;
  }

  /* ---------- טוקן ---------- */
  function getToken() {
    try {
      return localStorage.getItem(cfg.tokenKey) || "";
    } catch (e) {
      return "";
    }
  }
  function setToken(t) {
    try {
      localStorage.setItem(cfg.tokenKey, t);
    } catch (e) {}
  }
  function clearToken() {
    try {
      localStorage.removeItem(cfg.tokenKey);
    } catch (e) {}
  }
  function headers(token) {
    return {
      Authorization: "Bearer " + (token || getToken()),
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  /* ---------- קריאה ציבורית ---------- */
  async function loadPublic() {
    const res = await fetch("./data/links.json?ts=" + Date.now(), {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("טעינת הנתונים נכשלה (" + res.status + ")");
    return normalize(await res.json());
  }

  /* ---------- אימות טוקן + הרשאת כתיבה ---------- */
  async function verify(token) {
    if (!cfg.isGitHub) {
      throw new Error("אימות טוקן זמין רק כשהאתר רץ על GitHub Pages.");
    }
    const res = await fetch(
      cfg.apiBase + "/repos/" + cfg.owner + "/" + cfg.repo,
      { headers: headers(token) }
    );
    if (res.status === 401)
      throw new Error("הטוקן לא תקף (401). בדוק שהעתקת אותו במלואו ושלא פג תוקפו.");
    if (res.status === 404)
      throw new Error("ה-repo לא נמצא, או שלטוקן אין גישה אליו.");
    if (!res.ok) throw new Error("אימות נכשל (" + res.status + ").");
    const repo = await res.json();
    if (!repo.permissions || !repo.permissions.push) {
      throw new Error(
        "לטוקן אין הרשאת כתיבה. צור טוקן עם Contents: Read and write ל-repo הזה."
      );
    }
    return true;
  }

  /* ---------- קריאה טרייה לעריכה (עם sha) ---------- */
  async function loadForEdit() {
    if (!cfg.isGitHub) {
      // מצב בדיקה מקומית: קוראים מהקובץ הסטטי, ללא אפשרות שמירה
      _sha = null;
      return await loadPublic();
    }
    const url =
      cfg.apiBase +
      "/repos/" +
      cfg.owner +
      "/" +
      cfg.repo +
      "/contents/" +
      cfg.dataPath +
      "?ref=" +
      cfg.branch +
      "&ts=" +
      Date.now();
    const res = await fetch(url, { headers: headers(), cache: "no-store" });
    if (res.status === 404) {
      _sha = null;
      return normalize(null); // הקובץ עדיין לא קיים — נתחיל מריק
    }
    if (!res.ok) throw new Error("טעינה נכשלה (" + res.status + ").");
    const json = await res.json();
    _sha = json.sha;
    return normalize(JSON.parse(b64ToUtf8((json.content || "").replace(/\n/g, ""))));
  }

  /* ---------- שמירה (commit) ---------- */
  async function save(data) {
    if (!cfg.isGitHub)
      throw new Error("שמירה זמינה רק באתר החי על GitHub Pages.");
    const payload = normalize(data);
    payload.updatedAt = new Date().toISOString();

    const body = {
      message: "עדכון קישורים — " + new Date().toLocaleString("he-IL"),
      content: utf8ToB64(JSON.stringify(payload, null, 2) + "\n"),
      branch: cfg.branch,
    };
    if (_sha) body.sha = _sha;

    const url =
      cfg.apiBase +
      "/repos/" +
      cfg.owner +
      "/" +
      cfg.repo +
      "/contents/" +
      cfg.dataPath;

    async function put() {
      return fetch(url, {
        method: "PUT",
        headers: Object.assign({ "Content-Type": "application/json" }, headers()),
        body: JSON.stringify(body),
      });
    }

    let res = await put();
    if (res.status === 409) {
      // התנגשות sha — נטען מחדש וננסה שוב פעם אחת
      await loadForEdit();
      if (_sha) body.sha = _sha;
      else delete body.sha;
      res = await put();
    }
    if (!res.ok) {
      // שגיאה מובנית — admin.js מתרגם אותה להנחיה בעברית
      let apiMessage = "";
      try {
        const e = await res.json();
        if (e && e.message) apiMessage = e.message;
      } catch (_) {}
      const err = new Error(apiMessage || "HTTP " + res.status);
      err.status = res.status;
      err.apiMessage = apiMessage;
      err.endpoint = "PUT " + cfg.dataPath;
      throw err;
    }
    const out = await res.json();
    if (out && out.content && out.content.sha) _sha = out.content.sha;
    return payload;
  }

  return {
    loadPublic: loadPublic,
    loadForEdit: loadForEdit,
    verify: verify,
    save: save,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    uid: uid,
    normalize: normalize,
  };
})();
