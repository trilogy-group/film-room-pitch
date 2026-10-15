/* Film Room pitch: renders the page from the #content JSON, then runs navigation, presenter mode, the script drawer and video players. */
(function () {
  "use strict";
  var contentEl = document.getElementById("content");
  var state = JSON.parse(contentEl.textContent);
  window.FR = { state: state, render: render, slides: [] };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function field(sec, key, tag, cls, extra) {
    return "<" + tag + ' class="' + cls + '" data-field="' + sec.id + "." + key + '"' + (extra || "") + ">" + esc(sec[key]) + "</" + tag + ">";
  }
  var tools = '<div class="section-tools"><button type="button" data-act="up" title="Move up">&#8593;</button><button type="button" data-act="down" title="Move down">&#8595;</button><button type="button" data-act="hide" title="Hide this section">Hide</button></div><span class="changed-mark">Edited</span>';

  function renderSection(sec, i) {
    var notes = ' data-notes="' + esc(sec.script) + '"';
    var head = '<section class="slide ' + (sec.kind === "hero" || sec.kind === "demo" ? "slide-hero " : "") + (sec.kind === "fullvideo" ? "slide-full " : "") + (sec.kind === "ask" ? "slide-ask " : "") + '" id="' + esc(sec.id) + '" data-title="' + esc(sec.title) + '"' + notes + (sec.hidden ? " hidden" : "") + ">" + tools;
    var body = "";
    if (sec.kind === "hero") {
      body = '<div class="inner">' + field(sec, "eyebrow", "p", "eyebrow") + field(sec, "headline", "h1", "display") +
        '<blockquote class="quote quote-hero quote-under">' + field(sec, "quote", "p", "") + '<footer>' + field(sec, "attribution", "span", "foot") + "</footer></blockquote></div>";
    } else if (sec.kind === "fullvideo") {
      var pills = (sec.pills || []).map(function (p) { return '<span class="pill pill-' + esc(p[0]) + '">' + esc(p[1]) + "</span> "; }).join("");
      body = '<video class="loop full-video" muted loop playsinline preload="none" poster="' + esc(sec.poster) + '" aria-label="' + esc(sec.title) + '"><source src="' + esc(sec.src) + '" type="video/mp4"></video>' +
        '<p class="full-caption">' + pills + field(sec, "caption", "span", "") + "</p>";
    } else if (sec.kind === "demo") {
      body = '<div class="inner">' + field(sec, "eyebrow", "p", "eyebrow") + field(sec, "headline", "h2", "title") +
        '<figure class="hero-video"><div class="video-frame" id="demo-frame"><video id="demo-video" preload="none" playsinline poster="' + esc(sec.poster) + '"><source src="' + esc(sec.src) + '" type="video/mp4">' + (sec.webm ? '<source src="' + esc(sec.webm) + '" type="video/webm">' : "") + "</video>" +
        '<button class="play" id="demo-play" type="button" aria-label="Play the demo video"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg><span>Play the demo</span></button></div>' +
        '<figcaption>' + field(sec, "caption", "span", "foot") + "</figcaption></figure></div>";
    } else if (sec.kind === "ask") {
      body = '<div class="inner">' + field(sec, "eyebrow", "p", "eyebrow") + field(sec, "headline", "h2", "display") + field(sec, "lead", "p", "lead") + "</div>";
    } else {
      body = '<div class="inner">' + field(sec, "eyebrow", "p", "eyebrow") + field(sec, "headline", "h2", "title") + field(sec, "lead", "p", "lead") + "</div>";
    }
    return head + body + "</section>";
  }

  function render() {
    var deck = document.getElementById("deck");
    deck.innerHTML = state.sections.map(renderSection).join("\n");
    var visible = state.sections.filter(function (s) { return !s.hidden; });
    document.getElementById("links").innerHTML = visible.map(function (s) { return '<a href="#' + esc(s.id) + '">' + esc(s.title) + "</a>"; }).join("");
    document.getElementById("drawer-body").innerHTML = visible.map(function (s) {
      return '<div class="script-item" data-for="' + esc(s.id) + '"><h3><span>' + esc(s.title) + '</span><a href="#' + esc(s.id) + '">go</a></h3><p data-field="' + esc(s.id) + '.script">' + esc(s.script) + "</p></div>";
    }).join("");
    var fp = document.getElementById("foot-provenance"), ff = document.getElementById("foot-footage");
    if (fp) fp.textContent = state.footer.provenance;
    if (ff) ff.textContent = state.footer.footage;
    var v = document.getElementById("version-label"); if (v) v.textContent = "v" + state.version;
    window.FR.slides = Array.prototype.slice.call(deck.querySelectorAll(".slide:not([hidden])"));
    var all = document.getElementById("c-all"); if (all) all.textContent = String(window.FR.slides.length);
    bindMedia();
    if (window.FR.onRender) window.FR.onRender();
  }

  /* ---------- navigation, presenter, drawer (adapted from site-v3) ---------- */
  var body = document.body;
  var nowEl = document.getElementById("c-now"), bar = document.getElementById("progress"), pCount = document.getElementById("p-count");
  var presenter = document.getElementById("presenter"), notes = document.getElementById("notes"), notesTitle = document.getElementById("notes-title"), notesText = document.getElementById("notes-text");
  var presentBtn = document.getElementById("present-btn"), notesBtn = document.getElementById("p-notes");
  var drawer = document.getElementById("drawer"), scriptBtn = document.getElementById("script-btn"), drawerClose = document.getElementById("drawer-close");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var current = -1;
  function slides() { return window.FR.slides; }
  function store(k, v) { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }

  function indexFromScroll() {
    var probe = window.scrollY + window.innerHeight * 0.4, idx = 0, ss = slides();
    for (var i = 0; i < ss.length; i++) if (ss[i].offsetTop <= probe) idx = i;
    return idx;
  }
  function setCurrent(idx, force) {
    if (idx === current && !force) return;
    current = idx;
    var ss = slides(), s = ss[idx]; if (!s) return;
    if (nowEl) nowEl.textContent = String(idx + 1);
    if (pCount) pCount.textContent = (idx + 1) + " / " + ss.length;
    if (bar) bar.style.width = ((idx + 1) / ss.length * 100) + "%";
    if (s.id && history.replaceState) history.replaceState(null, "", "#" + s.id);
    if (notesTitle) notesTitle.textContent = (idx + 1) + " of " + ss.length + ": " + (s.getAttribute("data-title") || "");
    if (notesText) notesText.textContent = s.getAttribute("data-notes") || "No script for this section.";
    Array.prototype.forEach.call(document.querySelectorAll(".links a"), function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + s.id); });
    Array.prototype.forEach.call(document.querySelectorAll(".script-item"), function (el) { el.classList.toggle("on", el.getAttribute("data-for") === s.id); });
  }
  var ticking = false;
  window.addEventListener("scroll", function () { if (ticking) return; ticking = true; requestAnimationFrame(function () { ticking = false; setCurrent(indexFromScroll()); }); }, { passive: true });
  window.addEventListener("resize", function () { setCurrent(indexFromScroll()); });
  function go(idx) { var ss = slides(); idx = Math.max(0, Math.min(ss.length - 1, idx)); ss[idx].scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); setCurrent(idx); }
  function step(d) { go((current < 0 ? indexFromScroll() : current) + d); }

  document.addEventListener("keydown", function (e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    var onMedia = tag === "VIDEO", onButton = tag === "BUTTON" || tag === "A";
    switch (e.key) {
      case "ArrowRight": case "PageDown": if (onMedia) return; e.preventDefault(); step(1); break;
      case "ArrowLeft": case "PageUp": if (onMedia) return; e.preventDefault(); step(-1); break;
      case " ": case "Spacebar": if (onMedia || onButton) return; e.preventDefault(); step(e.shiftKey ? -1 : 1); break;
      case "Home": e.preventDefault(); go(0); break;
      case "End": e.preventDefault(); go(slides().length - 1); break;
      case "p": case "P": e.preventDefault(); setPresenting(!body.classList.contains("presenting")); break;
      case "n": case "N": if (body.classList.contains("presenting")) { e.preventDefault(); setNotes(notes.hidden); } break;
      case "s": case "S": e.preventDefault(); setDrawer(drawer.hidden); break;
      case "e": case "E": if (window.FR.toggleEdit) { e.preventDefault(); window.FR.toggleEdit(); } break;
      case "Escape": if (body.classList.contains("presenting")) setPresenting(false); else if (!drawer.hidden) setDrawer(false); break;
    }
  });

  function setNotes(on) { if (!notes) return; notes.hidden = !on; if (notesBtn) notesBtn.setAttribute("aria-pressed", on ? "true" : "false"); store("fr-notes", on ? "1" : null); }
  function setPresenting(on) {
    body.classList.toggle("presenting", on); if (presenter) presenter.hidden = !on;
    if (presentBtn) presentBtn.setAttribute("aria-pressed", on ? "true" : "false");
    if (!on) setNotes(false); if (on) setDrawer(false);
    store("fr-present", on ? "1" : null);
    var idx = current < 0 ? indexFromScroll() : current;
    setTimeout(function () { var s = slides()[idx]; if (s) s.scrollIntoView({ behavior: "instant", block: "start" }); }, 60);
  }
  function setDrawer(on) { drawer.hidden = !on; body.classList.toggle("drawer-open", on); if (scriptBtn) scriptBtn.setAttribute("aria-pressed", on ? "true" : "false"); store("fr-drawer", on ? "1" : null); }
  window.FR.setDrawer = setDrawer;
  if (presentBtn) presentBtn.addEventListener("click", function () { setPresenting(true); });
  if (scriptBtn) scriptBtn.addEventListener("click", function () { setDrawer(drawer.hidden); });
  if (drawerClose) drawerClose.addEventListener("click", function () { setDrawer(false); });
  ["p-prev", "p-next", "p-exit"].forEach(function (id) { var b = document.getElementById(id); if (!b) return; b.addEventListener("click", function () { if (id === "p-prev") step(-1); else if (id === "p-next") step(1); else setPresenting(false); }); });
  if (notesBtn) notesBtn.addEventListener("click", function () { setNotes(notes.hidden); });

  var sx = 0, sy = 0, st = 0;
  document.addEventListener("touchstart", function (e) { if (!body.classList.contains("presenting") || e.touches.length !== 1) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now(); }, { passive: true });
  document.addEventListener("touchend", function (e) { if (!body.classList.contains("presenting") || !st) return; var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy, quick = Date.now() - st < 700; st = 0; if (quick && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1); }, { passive: true });

  function bindMedia() {
    var demo = document.getElementById("demo-video"), demoBtn = document.getElementById("demo-play"), frame = document.getElementById("demo-frame");
    if (demo && demoBtn && frame) demoBtn.addEventListener("click", function () { frame.classList.add("playing"); demo.controls = true; demo.preload = "auto"; var p = demo.play(); if (p && p.catch) p.catch(function () {}); demo.focus(); });
    var loops = document.querySelectorAll("video.loop");
    if (!reduce && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) { entries.forEach(function (en) { var v = en.target; if (en.isIntersecting) { if (v.preload === "none") { v.preload = "auto"; v.load(); } var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause(); }); }, { threshold: 0.35 });
      Array.prototype.forEach.call(loops, function (v) { io.observe(v); });
    } else Array.prototype.forEach.call(loops, function (v) { v.controls = true; });
  }

  render();
  var params = new URLSearchParams(location.search);
  if (params.has("present") || load("fr-present") === "1") { setPresenting(true); if (params.get("notes") === "1" || load("fr-notes") === "1") setNotes(true); }
  if (params.has("script") || load("fr-drawer") === "1") setDrawer(true);
  var initial = -1;
  if (location.hash) initial = slides().indexOf(document.getElementById(location.hash.slice(1)));
  if (initial >= 0) { setCurrent(initial, true); requestAnimationFrame(function () { slides()[initial].scrollIntoView({ behavior: "instant", block: "start" }); }); }
  else setCurrent(indexFromScroll(), true);
  window.addEventListener("hashchange", function () { var i = slides().indexOf(document.getElementById(location.hash.slice(1))); if (i >= 0 && i !== current) go(i); });
  window.FR.refreshCurrent = function () { setCurrent(indexFromScroll(), true); };
})();
