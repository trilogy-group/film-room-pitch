/* Edit mode: type into any text, reorder or hide sections, keep a draft in this browser, download a copy, or publish to GitHub. */
(function () {
  "use strict";
  var FR = window.FR; if (!FR) return;
  var REPO = "trilogy-group/film-room-pitch";
  var BRANCH = "main";
  var body = document.body;
  var contentEl = document.getElementById("content");
  var editbar = document.getElementById("editbar"), msg = document.getElementById("edit-msg");
  var editBtn = document.getElementById("edit-btn");
  var DRAFT = "fr-draft-v" + FR.state.version;
  var published = JSON.parse(JSON.stringify(FR.state));
  var dirty = false;

  var mem = {};
  var store = {
    get: function (k) { try { return localStorage.getItem(k) || mem[k] || ""; } catch (e) { return mem[k] || ""; } },
    set: function (k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch (e) {} },
    remove: function (k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) {} }
  };

  loadSource();

  /* ---- draft: restore on load ---- */
  var draft = store.get(DRAFT);
  if (draft) {
    try { var d = JSON.parse(draft); if (d && d.sections) { FR.state.sections = d.sections; FR.state.footer = d.footer || FR.state.footer; FR.render(); dirty = true; } } catch (e) {}
  }

  function setField(path, value) {
    var parts = path.split("."), id = parts[0], key = parts[1];
    if (id === "footer") { FR.state.footer[key] = value; return; }
    var sec = FR.state.sections.filter(function (s) { return s.id === id; })[0];
    if (sec) sec[key] = value;
  }
  function getField(path) {
    var parts = path.split("."), id = parts[0], key = parts[1];
    if (id === "footer") return FR.state.footer[key];
    var sec = FR.state.sections.filter(function (s) { return s.id === id; })[0];
    return sec ? sec[key] : "";
  }
  function markChanged() {
    FR.state.sections.forEach(function (s) {
      var p = published.sections.filter(function (q) { return q.id === s.id; })[0];
      var el = document.getElementById(s.id); if (!el) return;
      var changed = !p || JSON.stringify(p) !== JSON.stringify(s);
      if (changed) el.setAttribute("data-changed", "1"); else el.removeAttribute("data-changed");
    });
  }
  function saveDraft() {
    dirty = true;
    store.set(DRAFT, JSON.stringify({ sections: FR.state.sections, footer: FR.state.footer }));
    markChanged();
    if (msg) msg.textContent = "Draft saved in this browser. Publish to share it.";
  }

  /* ---- editable fields ---- */
  function wire() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-field]"), function (el) {
      el.contentEditable = body.classList.contains("editing") ? "plaintext-only" : "false";
      if (el.contentEditable === "inherit") el.contentEditable = body.classList.contains("editing") ? "true" : "false";
      el.oninput = function () { setField(el.getAttribute("data-field"), el.innerText.replace(/ /g, " ")); syncTwins(el); saveDraft(); };
      el.onblur = function () { if (el.getAttribute("data-field").slice(-7) === ".script") { var sec = document.getElementById(el.getAttribute("data-field").split(".")[0]); if (sec) sec.setAttribute("data-notes", getField(el.getAttribute("data-field"))); FR.refreshCurrent(); } };
    });
    Array.prototype.forEach.call(document.querySelectorAll(".section-tools button"), function (b) {
      b.onclick = function () {
        var sec = b.closest(".slide"), id = sec.id, i = FR.state.sections.findIndex(function (s) { return s.id === id; });
        var act = b.getAttribute("data-act");
        if (act === "up" && i > 0) { var t = FR.state.sections[i - 1]; FR.state.sections[i - 1] = FR.state.sections[i]; FR.state.sections[i] = t; }
        if (act === "down" && i < FR.state.sections.length - 1) { var u = FR.state.sections[i + 1]; FR.state.sections[i + 1] = FR.state.sections[i]; FR.state.sections[i] = u; }
        if (act === "hide") FR.state.sections[i].hidden = true;
        FR.render(); saveDraft(); location.hash = "#" + id; FR.refreshCurrent();
      };
    });
  }
  /* the same field can appear twice (script in the drawer and as notes) */
  function syncTwins(src) {
    var path = src.getAttribute("data-field");
    Array.prototype.forEach.call(document.querySelectorAll('[data-field="' + path + '"]'), function (el) { if (el !== src && el.innerText !== src.innerText) el.innerText = src.innerText; });
  }
  FR.onRender = wire;
  wire();

  function setEditing(on) {
    body.classList.toggle("editing", on);
    editbar.hidden = !on;
    editBtn.setAttribute("aria-pressed", on ? "true" : "false");
    if (on) { FR.setDrawer(true); if (msg) msg.textContent = dirty ? "You have an unpublished draft from this browser." : "Editing. Click any text to change it. Drafts save in this browser."; }
    wire(); markChanged();
  }
  FR.toggleEdit = function () { setEditing(!body.classList.contains("editing")); };
  editBtn.addEventListener("click", FR.toggleEdit);
  document.getElementById("done-btn").addEventListener("click", function () { setEditing(false); });
  document.getElementById("revert-btn").addEventListener("click", function () {
    if (!confirm("Discard the draft in this browser and go back to the published version?")) return;
    store.remove(DRAFT); FR.state.sections = JSON.parse(JSON.stringify(published.sections)); FR.state.footer = JSON.parse(JSON.stringify(published.footer)); dirty = false; FR.render(); markChanged(); if (msg) msg.textContent = "Draft discarded.";
  });

  /* ---- build the new HTML file ---- */
  function buildHtml(nextVersion, entry) {
    var next = JSON.parse(JSON.stringify(FR.state));
    next.version = nextVersion;
    next.history = (published.history || []).concat([entry]);
    var json = JSON.stringify(next, null, 1).replace(/<\//g, "<\\/");
    var html = document.documentElement.outerHTML;
    // take the current source, not the rendered DOM: fetch is not available offline, so rebuild from a template of this document
    var src = window.__FR_SOURCE__ || null;
    if (!src) return null;
    return src.replace(/<script id="content" type="application\/json">[\s\S]*?<\/script>/, '<script id="content" type="application/json">\n' + json + '\n</script>');
  }
  function changeSummary() {
    var ids = FR.state.sections.filter(function (s) { var p = published.sections.filter(function (q) { return q.id === s.id; })[0]; return !p || JSON.stringify(p) !== JSON.stringify(s); }).map(function (s) { return s.title; });
    return ids;
  }

  /* ---- download a copy ---- */
  document.getElementById("download-btn").addEventListener("click", function () {
    var src = window.__FR_SOURCE__; if (!src) { loadSource(); return alert("Page source not loaded yet; try again in a second."); }
    var entry = { version: FR.state.version + 1, by: "local copy", at: new Date().toISOString(), note: "Downloaded copy", changed: changeSummary() };
    var html = buildHtml(FR.state.version + 1, entry);
    var blob = new Blob([html], { type: "text/html" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "film-room-v" + (FR.state.version + 1) + ".html"; a.click();
  });

  async function loadSource() {
    if (window.__FR_SOURCE__) return window.__FR_SOURCE__;
    try { var m = document.querySelector('meta[name="fr-source"]'); } catch (e) {}
    try { var r = await fetch(location.pathname.replace(/[^/]*$/, "") + "index.html", { cache: "no-store" }); if (r.ok) { window.__FR_SOURCE__ = await r.text(); return window.__FR_SOURCE__; } } catch (e) {}
    return null;
  }

  /* ---- publish to GitHub ---- */
  var dlg = document.getElementById("publish-dialog"), form = document.getElementById("publish-form"), err = document.getElementById("publish-error");
  var tokenLabel = document.getElementById("token-label");
  var hosted = /github\.io$/.test(location.hostname);
  document.getElementById("publish-btn").addEventListener("click", function () {
    err.hidden = true; form.name.value = store.get("fr-name"); form.token.value = "";
    tokenLabel.hidden = !!store.get("fr-token");
    document.getElementById("publish-title").textContent = "Publish v" + (FR.state.version + 1);
    if (!hosted) document.getElementById("publish-help").textContent = "This copy is not on GitHub Pages. Publish still commits to " + REPO + " and GitHub Pages will show it at the shared link.";
    dlg.showModal();
  });
  document.getElementById("publish-cancel").addEventListener("click", function () { dlg.close(); });

  async function gh(path, token, opts) {
    opts = opts || {};
    var r = await fetch("https://api.github.com/repos/" + REPO + path, { method: opts.method || "GET", cache: "no-store", headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    if (!r.ok) { var e = new Error("GitHub " + r.status); e.status = r.status; try { e.detail = (await r.json()).message; } catch (x) {} throw e; }
    return r.json();
  }
  function b64(s) { return btoa(unescape(encodeURIComponent(s))); }

  form.addEventListener("submit", async function (e) {
    e.preventDefault(); err.hidden = true;
    var name = form.name.value.trim(), note = form.note.value.trim(), token = form.token.value.trim() || store.get("fr-token");
    if (!token) { err.textContent = "Paste a GitHub token."; err.hidden = false; return; }
    var go = document.getElementById("publish-go"); go.disabled = true; go.textContent = "Publishing…";
    try {
      var src = await loadSource(); if (!src) throw new Error("Could not read the page source.");
      // conflict check: the live file must still be at our version
      var live = await gh("/contents/index.html?ref=" + BRANCH, token);
      var liveText = decodeURIComponent(escape(atob(live.content.replace(/\n/g, ""))));
      var m = liveText.match(/"version":\s*(\d+)/); var liveVersion = m ? parseInt(m[1], 10) : 0;
      if (liveVersion !== FR.state.version) { var ce = new Error("stale"); ce.stale = liveVersion; throw ce; }
      var nextVersion = FR.state.version + 1;
      var entry = { version: nextVersion, by: name, at: new Date().toISOString(), note: note || "No note.", changed: changeSummary() };
      var html = buildHtml(nextVersion, entry);
      // keep a copy of the version being replaced
      await gh("/contents/versions/v" + FR.state.version + ".html", token, { method: "PUT", body: { message: "Keep v" + FR.state.version, content: live.content.replace(/\n/g, ""), branch: BRANCH } }).catch(function (x) { if (x.status !== 422) throw x; });
      await gh("/contents/index.html", token, { method: "PUT", body: { message: "v" + nextVersion + " by " + name + ": " + (note || "no note"), content: b64(html), sha: live.sha, branch: BRANCH } });
      // versions index
      var hist = (published.history || []).concat([entry]);
      var rows = hist.slice().reverse().map(function (h) { return "<tr><td>v" + h.version + "</td><td>" + esc(h.by) + "</td><td>" + esc(new Date(h.at).toLocaleString()) + "</td><td>" + esc(h.note) + "</td><td>" + esc((h.changed || []).join(", ")) + "</td><td>" + (h.version === nextVersion ? '<a href="../index.html">current</a>' : '<a href="v' + h.version + '.html">open</a>') + "</td></tr>"; }).join("");
      var vhtml = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Film Room, versions</title><meta name="robots" content="noindex"><link rel="stylesheet" href="../styles.css"><link rel="stylesheet" href="../editor.css"></head><body><div class="versions"><p class="eyebrow">Film Room</p><h1 class="title">Version history</h1><p class="lead"><a href="../index.html">Back to the pitch</a></p><table><thead><tr><th>Version</th><th>By</th><th>When</th><th>Note</th><th>Sections changed</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div></body></html>";
      var vi = null; try { vi = await gh("/contents/versions/index.html?ref=" + BRANCH, token); } catch (x) {}
      await gh("/contents/versions/index.html", token, { method: "PUT", body: { message: "Versions index v" + nextVersion, content: b64(vhtml), sha: vi ? vi.sha : undefined, branch: BRANCH } });
      store.set("fr-name", name); if (form.token.value.trim()) store.set("fr-token", form.token.value.trim());
      store.remove(DRAFT);
      dlg.close();
      alert("Published v" + nextVersion + ". GitHub Pages updates in about a minute; reload to see it.");
      setTimeout(function () { location.reload(); }, 1500);
    } catch (x) {
      err.hidden = false;
      if (x.stale !== undefined) err.textContent = "Someone published v" + x.stale + " after you opened this page, so yours cannot go on top of it. Download your copy to keep your edits, then open the latest version and redo them there.";
      else if (x.status === 401) { err.textContent = "GitHub did not accept that token. Paste it again."; store.remove("fr-token"); tokenLabel.hidden = false; }
      else if (x.status === 403 || x.status === 404) err.textContent = "That token cannot write to " + REPO + ". It needs Contents: Read and write on that repository.";
      else err.textContent = "Publish failed: " + (x.detail || x.message);
    } finally { go.disabled = false; go.textContent = "Publish"; }
  });
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
})();
