/*
 * admin.js — ממשק הניהול.
 * מסך נעילה (טוקן) → עורך (פרופיל + קבוצות + קישורים) → שמירה (commit).
 * כל העריכות מעדכנות אובייקט state יחיד; רינדור מחדש רק בשינוי מבני.
 */
(function () {
  const store = window.LINKHUB_STORE;
  const cfg = window.LINKHUB_CONFIG;
  const $ = function (id) {
    return document.getElementById(id);
  };
  const localMode = !cfg.isGitHub;

  let state = null;
  let dirty = false;
  let saving = false;
  let drag = null; // { id } בזמן גרירה
  let autosaveTimer = null;
  let autosaveBlocked = false; // אחרי כשל — עוצרים שמירה אוטומטית עד טיפול
  const AUTOSAVE_DELAY = 3500; // מ"ש של חוסר פעילות לפני שמירה אוטומטית

  /* ================= עזרים ================= */
  function toast(msg, kind) {
    const t = $("toast");
    t.textContent = msg;
    t.className = "toast show" + (kind ? " toast--" + kind : "");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      t.className = "toast";
    }, kind === "error" ? 4200 : 2600);
  }

  function safeUrl(u) {
    if (typeof u !== "string" || !u.trim()) return null;
    try {
      const p = new URL(u, location.href);
      return ["http:", "https:", "mailto:", "tel:"].indexOf(p.protocol) !== -1
        ? p.href
        : null;
    } catch (e) {
      return null;
    }
  }

  function setDirty(v) {
    dirty = v;
    const s = $("status");
    if (localMode) {
      s.textContent = "מצב בדיקה מקומי — שמירה מושבתת";
      s.dataset.dirty = "false";
    } else if (saving) {
      s.textContent = "שומר…";
      s.dataset.dirty = "true";
    } else if (dirty && autosaveBlocked) {
      s.textContent = "השמירה נכשלה";
      s.dataset.dirty = "true";
    } else if (dirty) {
      s.textContent = "ממתין לשמירה…";
      s.dataset.dirty = "true";
      scheduleAutosave();
    } else {
      s.textContent = "נשמר ✓";
      s.dataset.dirty = "false";
    }
    $("saveBtn").disabled = localMode || saving || !dirty;
  }

  function findPos(itemId) {
    for (let s = 0; s < state.sections.length; s++) {
      const items = state.sections[s].items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].id === itemId) return { s: s, i: i };
      }
    }
    return null;
  }

  /* ================= מסך נעילה ================= */
  function showLock(msg) {
    $("app").hidden = true;
    $("lock").hidden = false;
    if (msg) toast(msg, "error");
    setTimeout(function () {
      $("tokenInput").focus();
    }, 50);
  }

  function wireLock() {
    $("tokenReveal").addEventListener("change", function (e) {
      $("tokenInput").type = e.target.checked ? "text" : "password";
    });
    $("lockForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      const token = $("tokenInput").value.trim();
      if (!token) {
        toast("צריך להדביק טוקן.", "error");
        return;
      }
      const btn = $("lockBtn");
      btn.disabled = true;
      btn.textContent = "בודק…";
      try {
        await store.verify(token);
        store.setToken(token);
        $("tokenInput").value = "";
        await enterEditor();
      } catch (err) {
        toast(err.message || "אימות נכשל.", "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "כניסה";
      }
    });
  }

  /* ================= כניסה לעורך ================= */
  async function enterEditor() {
    state = await store.loadForEdit();
    $("lock").hidden = true;
    $("app").hidden = false;

    // פרופיל
    $("pName").value = state.profile.name || "";
    $("pTagline").value = state.profile.tagline || "";
    $("pAvatar").value = state.profile.avatar || "";

    renderSections();
    renderPreview();
    setDirty(false);
    if (localMode) {
      toast("מצב בדיקה מקומי: אפשר לערוך ולראות תצוגה מקדימה, אבל לא לשמור.", null);
    }
  }

  /* ================= רינדור העורך ================= */
  function renderSections() {
    const wrap = $("sections");
    wrap.textContent = "";
    if (state.sections.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-note";
      p.textContent = "אין קבוצות. הוסיפו קבוצה כדי להתחיל.";
      wrap.appendChild(p);
    }
    state.sections.forEach(function (section) {
      wrap.appendChild(buildSection(section));
    });
  }

  function buildSection(section) {
    const node = $("tpl-section").content.firstElementChild.cloneNode(true);
    node.dataset.sid = section.id;

    const stitle = node.querySelector('[data-f="stitle"]');
    stitle.value = section.title || "";
    stitle.addEventListener("input", function () {
      section.title = stitle.value;
      renderPreview();
      setDirty(true);
    });

    node.querySelector('[data-act="sup"]').addEventListener("click", function () {
      moveSection(section.id, -1);
    });
    node.querySelector('[data-act="sdown"]').addEventListener("click", function () {
      moveSection(section.id, 1);
    });
    node.querySelector('[data-act="sdel"]').addEventListener("click", function () {
      const count = section.items.length;
      if (count > 0 && !confirm("למחוק את הקבוצה ואת " + count + " הקישורים שבתוכה?"))
        return;
      const idx = state.sections.findIndex(function (s) {
        return s.id === section.id;
      });
      if (idx !== -1) state.sections.splice(idx, 1);
      renderSections();
      renderPreview();
      setDirty(true);
    });
    node.querySelector('[data-act="add-item"]').addEventListener("click", function () {
      const item = {
        id: store.uid(),
        title: "",
        url: "",
        description: "",
        icon: "",
        hidden: false,
      };
      section.items.push(item);
      renderSections();
      renderPreview();
      setDirty(true);
      // מיקוד בשדה השם של הפריט החדש
      const secEl = $("sections").querySelector('[data-sid="' + section.id + '"]');
      const titles = secEl.querySelectorAll('.item-ed [data-f="title"]');
      if (titles.length) titles[titles.length - 1].focus();
    });

    const itemsWrap = node.querySelector("[data-items]");
    if (section.items.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-note";
      p.textContent = "אין קישורים בקבוצה הזו.";
      itemsWrap.appendChild(p);
    }
    section.items.forEach(function (item) {
      itemsWrap.appendChild(buildItem(section, item));
    });

    return node;
  }

  function buildItem(section, item) {
    const node = $("tpl-item").content.firstElementChild.cloneNode(true);
    node.dataset.iid = item.id;

    function bindText(field) {
      const input = node.querySelector('[data-f="' + field + '"]');
      input.value = item[field] || "";
      input.addEventListener("input", function () {
        item[field] = input.value;
        renderPreview();
        setDirty(true);
      });
    }
    bindText("title");
    bindText("url");
    bindText("description");
    bindText("icon");

    const hidden = node.querySelector('[data-f="hidden"]');
    hidden.checked = Boolean(item.hidden);
    hidden.addEventListener("change", function () {
      item.hidden = hidden.checked;
      renderPreview();
      setDirty(true);
    });

    node.querySelector('[data-act="up"]').addEventListener("click", function () {
      moveItem(item.id, -1);
    });
    node.querySelector('[data-act="down"]').addEventListener("click", function () {
      moveItem(item.id, 1);
    });
    node.querySelector('[data-act="del"]').addEventListener("click", function () {
      const pos = findPos(item.id);
      if (!pos) return;
      const hasContent = item.title || item.url;
      if (hasContent && !confirm("למחוק את הקישור הזה?")) return;
      state.sections[pos.s].items.splice(pos.i, 1);
      renderSections();
      renderPreview();
      setDirty(true);
    });

    // גרירה לשינוי סדר
    node.addEventListener("dragstart", function (e) {
      drag = { id: item.id };
      node.classList.add("dragging");
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.id);
      } catch (_) {}
    });
    node.addEventListener("dragend", function () {
      drag = null;
      node.classList.remove("dragging");
      document.querySelectorAll(".item-ed.drag-over").forEach(function (el) {
        el.classList.remove("drag-over");
      });
    });
    node.addEventListener("dragover", function (e) {
      if (!drag || drag.id === item.id) return;
      e.preventDefault();
      node.classList.add("drag-over");
    });
    node.addEventListener("dragleave", function () {
      node.classList.remove("drag-over");
    });
    node.addEventListener("drop", function (e) {
      if (!drag || drag.id === item.id) return;
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      dropItem(drag.id, item.id, after);
    });

    return node;
  }

  /* ================= פעולות מבניות ================= */
  function moveItem(id, dir) {
    const pos = findPos(id);
    if (!pos) return;
    const items = state.sections[pos.s].items;
    const j = pos.i + dir;
    if (j < 0 || j >= items.length) return;
    const tmp = items[pos.i];
    items[pos.i] = items[j];
    items[j] = tmp;
    renderSections();
    renderPreview();
    setDirty(true);
  }

  function dropItem(dragId, targetId, after) {
    const from = findPos(dragId);
    if (!from) return;
    const moved = state.sections[from.s].items.splice(from.i, 1)[0];
    const to = findPos(targetId);
    if (!to) {
      // ליתר ביטחון — מחזירים למקום
      state.sections[from.s].items.splice(from.i, 0, moved);
      return;
    }
    const idx = to.i + (after ? 1 : 0);
    state.sections[to.s].items.splice(idx, 0, moved);
    renderSections();
    renderPreview();
    setDirty(true);
  }

  function moveSection(id, dir) {
    const i = state.sections.findIndex(function (s) {
      return s.id === id;
    });
    const j = i + dir;
    if (i === -1 || j < 0 || j >= state.sections.length) return;
    const tmp = state.sections[i];
    state.sections[i] = state.sections[j];
    state.sections[j] = tmp;
    renderSections();
    renderPreview();
    setDirty(true);
  }

  /* ================= תצוגה מקדימה ================= */
  const ARROW_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  const LINK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>';

  function svgEl(markup) {
    const span = document.createElement("span");
    span.innerHTML = markup;
    return span.firstChild;
  }

  function previewCard(item) {
    const a = document.createElement("a");
    a.className = "link-card";
    a.href = safeUrl(item.url) || "#";
    a.addEventListener("click", function (e) {
      e.preventDefault();
    });

    const icon = document.createElement("span");
    icon.className = "link-card__icon";
    if (item.icon && item.icon.trim()) icon.textContent = item.icon.trim();
    else icon.appendChild(svgEl(LINK_SVG));
    a.appendChild(icon);

    const body = document.createElement("div");
    body.className = "link-card__body";
    const title = document.createElement("div");
    title.className = "link-card__title";
    title.textContent = item.title || item.url || "(ללא שם)";
    body.appendChild(title);
    if (item.description && item.description.trim()) {
      const d = document.createElement("div");
      d.className = "link-card__desc";
      d.textContent = item.description.trim();
      body.appendChild(d);
    }
    a.appendChild(body);

    const arrow = document.createElement("span");
    arrow.className = "link-card__arrow";
    arrow.appendChild(svgEl(ARROW_SVG));
    a.appendChild(arrow);
    return a;
  }

  function renderPreview() {
    const name = ($("pName").value || "").trim();
    const tagline = ($("pTagline").value || "").trim();
    const avatar = ($("pAvatar").value || "").trim();
    // מסנכרנים חזרה ל-state (השדות הם מקור האמת לפרופיל)
    state.profile.name = $("pName").value;
    state.profile.tagline = $("pTagline").value;
    state.profile.avatar = $("pAvatar").value;

    $("pvName").textContent = name;
    const tEl = $("pvTagline");
    tEl.textContent = tagline;
    tEl.hidden = !tagline;

    const av = $("pvAvatar");
    if (avatar) {
      av.src = avatar;
      av.style.display = "";
      av.onerror = function () {
        av.style.display = "none";
      };
    } else {
      av.style.display = "none";
    }

    const wrap = $("pvLinks");
    wrap.textContent = "";
    let shown = 0;
    state.sections.forEach(function (section) {
      const visible = section.items.filter(function (it) {
        return !it.hidden && safeUrl(it.url);
      });
      if (visible.length === 0) return;
      const sec = document.createElement("section");
      if (section.title && section.title.trim()) {
        const h = document.createElement("h3");
        h.className = "section__title";
        h.textContent = section.title.trim();
        sec.appendChild(h);
      }
      const list = document.createElement("div");
      list.className = "section__list";
      visible.forEach(function (it) {
        list.appendChild(previewCard(it));
        shown++;
      });
      sec.appendChild(list);
      wrap.appendChild(sec);
    });
    if (shown === 0) {
      const e = document.createElement("div");
      e.className = "empty";
      e.textContent = "אין עדיין קישורים גלויים.";
      wrap.appendChild(e);
    }
  }

  /* ================= שמירה (אוטומטית + ידנית) ================= */
  function scheduleAutosave() {
    if (localMode || autosaveBlocked) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(function () {
      doSave(false);
    }, AUTOSAVE_DELAY);
  }

  function showError(msg) {
    $("errText").textContent = msg;
    $("errbar").hidden = false;
  }
  function hideError() {
    $("errbar").hidden = true;
  }

  async function doSave(manual) {
    clearTimeout(autosaveTimer);
    if (manual) autosaveBlocked = false; // לחיצה ידנית = ניסיון מחדש
    if (saving || localMode || !dirty) return;

    saving = true;
    setDirty(dirty);
    try {
      await store.save(state);
      saving = false;
      autosaveBlocked = false;
      hideError();
      setDirty(false);
      toast("נשמר ✓  האתר הציבורי יתעדכן בעוד רגע.", "ok");
    } catch (err) {
      saving = false;
      autosaveBlocked = true; // לא מנסים שוב אוטומטית עד שהמשתמש מטפל
      setDirty(dirty);
      const m = err.message || "שמירה נכשלה.";
      if (/401/.test(m)) {
        store.clearToken();
        showLock();
        toast("הטוקן פג או בוטל — צריך להיכנס מחדש.", "error");
      } else {
        showError("השמירה נכשלה: " + m);
      }
    }
  }

  /* ================= איתחול ================= */
  function wireApp() {
    // שדות פרופיל
    ["pName", "pTagline", "pAvatar"].forEach(function (id) {
      $(id).addEventListener("input", function () {
        renderPreview();
        setDirty(true);
      });
    });
    $("addSection").addEventListener("click", function () {
      state.sections.push({ id: store.uid(), title: "", items: [] });
      renderSections();
      renderPreview();
      setDirty(true);
    });
    $("saveBtn").addEventListener("click", function () {
      doSave(true);
    });
    $("errRetry").addEventListener("click", function () {
      doSave(true);
    });
    $("errClose").addEventListener("click", hideError);
    $("lockNow").addEventListener("click", function () {
      if (dirty && !confirm("יש שינויים שלא נשמרו. לצאת בכל זאת?")) return;
      store.clearToken();
      location.reload();
    });

    // קיצור מקלדת לשמירה
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        doSave(true);
      }
    });

    window.addEventListener("beforeunload", function (e) {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
  }

  async function boot() {
    // קישור יצירת הטוקן — לעמוד ה-fine-grained tokens
    const link = $("tokenLink");
    if (link) link.href = "https://github.com/settings/personal-access-tokens/new";

    wireLock();
    wireApp();

    if (localMode) {
      await enterEditor();
      return;
    }
    if (store.getToken()) {
      try {
        await enterEditor();
      } catch (err) {
        store.clearToken();
        showLock(err.message);
      }
    } else {
      showLock();
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
