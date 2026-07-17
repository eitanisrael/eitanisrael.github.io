/*
 * public.js — טוען את data/links.json ומצייר את עמוד הקישורים הציבורי.
 * מוצג רק פריט שאינו מוסתר ושיש לו כתובת תקינה.
 */
(function () {
  const store = window.LINKHUB_STORE;

  const ARROW_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
  const LINK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="18" height="18"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>';

  function safeUrl(u) {
    if (typeof u !== "string" || !u.trim()) return null;
    try {
      const parsed = new URL(u, location.href);
      const ok = ["http:", "https:", "mailto:", "tel:"];
      return ok.indexOf(parsed.protocol) !== -1 ? parsed.href : null;
    } catch (e) {
      return null;
    }
  }

  function svgEl(markup) {
    const span = document.createElement("span");
    span.innerHTML = markup; // קבוע סטטי בלבד — לא נתוני משתמש
    return span.firstChild;
  }

  function buildCard(item) {
    const href = safeUrl(item.url);
    const a = document.createElement("a");
    a.className = "link-card";
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    const icon = document.createElement("span");
    icon.className = "link-card__icon";
    icon.setAttribute("aria-hidden", "true");
    if (item.icon && item.icon.trim()) {
      icon.textContent = item.icon.trim();
    } else {
      icon.appendChild(svgEl(LINK_SVG));
    }
    a.appendChild(icon);

    const body = document.createElement("div");
    body.className = "link-card__body";
    const title = document.createElement("div");
    title.className = "link-card__title";
    title.textContent = item.title || item.url;
    body.appendChild(title);
    if (item.description && item.description.trim()) {
      const desc = document.createElement("div");
      desc.className = "link-card__desc";
      desc.textContent = item.description.trim();
      body.appendChild(desc);
    }
    a.appendChild(body);

    const arrow = document.createElement("span");
    arrow.className = "link-card__arrow";
    arrow.appendChild(svgEl(ARROW_SVG));
    a.appendChild(arrow);

    return a;
  }

  function render(data) {
    // פרופיל
    const profile = document.getElementById("profile");
    const name = (data.profile.name || "").trim();
    const tagline = (data.profile.tagline || "").trim();
    document.getElementById("name").textContent = name;
    const tEl = document.getElementById("tagline");
    tEl.textContent = tagline;
    tEl.hidden = !tagline;
    if (name) document.title = name + " — קישורים";

    const avatar = document.getElementById("avatar");
    if (data.profile.avatar) {
      avatar.src = data.profile.avatar;
      avatar.alt = name || "תמונת פרופיל";
      avatar.onerror = function () {
        avatar.style.display = "none";
      };
    } else {
      avatar.style.display = "none";
    }
    profile.hidden = false;

    // קישורים
    const wrap = document.getElementById("links");
    wrap.textContent = "";
    let shown = 0;

    data.sections.forEach(function (section) {
      const visible = section.items.filter(function (it) {
        return !it.hidden && safeUrl(it.url);
      });
      if (visible.length === 0) return;

      const sec = document.createElement("section");
      sec.className = "section";
      if (section.title && section.title.trim()) {
        const h = document.createElement("h2");
        h.className = "section__title";
        h.textContent = section.title.trim();
        sec.appendChild(h);
      }
      const list = document.createElement("div");
      list.className = "section__list";
      visible.forEach(function (it) {
        list.appendChild(buildCard(it));
        shown++;
      });
      sec.appendChild(list);
      wrap.appendChild(sec);
    });

    if (shown === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "הקישורים בדרך. בקרוב כאן.";
      wrap.appendChild(empty);
    }

    // פוטר
    const foot = document.getElementById("foot");
    if (name) {
      foot.textContent = "© " + new Date().getFullYear() + " " + name;
      foot.hidden = false;
    }
  }

  function showError() {
    const wrap = document.getElementById("links");
    wrap.textContent = "";
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "לא הצלחנו לטעון את הקישורים כרגע. נסו לרענן.";
    wrap.appendChild(empty);
  }

  store.loadPublic().then(render).catch(showError);
})();
