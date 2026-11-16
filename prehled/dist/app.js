"use strict";

const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat("cs-CZ");
const percent = new Intl.NumberFormat("cs-CZ", { style: "percent", maximumFractionDigits: 1 });
const month = new Intl.DateTimeFormat("cs-CZ", { month: "short", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });
const snapshotDate = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Prague" });
const icons = {
  city: '<path d="M3 20h18M5 20V10l7-5 7 5v10M9 20v-6h6v6M12 5V2m0 0h5l-1 2h-4"/>',
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8m-8 4h8m-8 4h5"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2.5" fill="#122e28"/><circle cx="15" cy="17" r="2.5" fill="#122e28"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  down: '<path d="M12 5v14m-5-5 5 5 5-5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  chart: '<path d="M4 4v16h16M7 15l4-4 3 2 5-6m-4 0h4v4"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/>',
  reset: '<path d="M4 12a8 8 0 1 1 2 5m-2-5V6m0 6h6"/>',
  filter: '<path d="M3 6h18M6 12h12m-9 6h6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m21 16-5-5L5 20"/>',
  comment: '<path d="M5 18v3l4-3h9a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 2 3z"/>'
};

function icon(name, size = 17) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function dateLabel(value) {
  const date = new Date(`${value?.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(+date) ? shortDate.format(date) : "—";
}

function dateTime(value) {
  return value ? `${dateLabel(value)} · ${value.slice(11, 16)}` : "—";
}

const statusLabels = new Map([["in_progress", "V řešení"], ["solved", "Vyřešeno"]]);
const statusLabel = status => statusLabels.get(status) || (status ? `Jiný stav (${status})` : "Neuvedeno");
const statusClass = status => statusLabels.has(status) ? status : "other";
const badge = status => `<span class="status ${statusClass(status)}">${escapeHtml(statusLabel(status))}</span>`;
const fold = value => String(value).normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("cs");
const categoriesOf = report => report.issueCategory?.name || "Bez kategorie";
const localPhotos = files => (files || []).filter(file => /^images\/\d+\/[a-z0-9._-]+\.(?:png|jpe?g)$/i.test(file.local_path));
const photoPath = file => `../../${file.local_path}`;
const commentsOf = report => report.comments || [];

function coordinates(report) {
  if (!String(report.gps_lat ?? "").trim() || !String(report.gps_lng ?? "").trim()) return null;
  const lat = Number(report.gps_lat);
  const lon = Number(report.gps_lng);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

const metrics = [
  { key: "total", label: "Celkem hlášení", icon: "list", tone: "", note: "Ve zvoleném rozsahu", value: totals => number.format(totals.total) },
  { key: "open", label: "Nevyřešeno", icon: "clock", tone: "amber", note: "Hlášení ve stavu V řešení", value: totals => number.format(totals.open) },
  { key: "solved", label: "Vyřešeno", icon: "check", tone: "green", note: "Uzavřené podněty", value: totals => number.format(totals.solved) },
  { key: "rate", label: "Míra vyřešení", icon: "chart", tone: "blue", note: "Podíl vyřešených z celku", value: totals => totals.total ? percent.format(totals.solved / totals.total) : "—" },
  { key: "photos", label: "S fotografiemi", icon: "image", tone: "blue", note: "Hlášení s místní přílohou", value: totals => number.format(totals.photos) },
  { key: "comments", label: "Komentáře", icon: "comment", tone: "", note: "Komentáře k hlášením", value: totals => number.format(totals.comments) }
];

const defaults = { metrics: ["total", "open", "solved", "rate"], scope: "filtered", trend: true, categories: true, interval: "month" };
const storageKey = "decin-preferences-v1";
const pageSize = 12;
const views = {
  prehled: { crumb: "Přehled", title: "Přehled hlášení", subtitle: "Podněty občanů a stav jejich řešení ve městě Děčín.", target: "mapa", action: "Zobrazit mapu", icon: "map" },
  hlaseni: { crumb: "Hlášení", title: "Seznam hlášení", subtitle: "Vyhledejte podněty a otevřete související fotografie a komentáře.", target: "mapa", action: "Zobrazit mapu", icon: "map" },
  mapa: { crumb: "Mapa hlášení", title: "Mapa hlášení", subtitle: "Rozložení podnětů podle souřadnic z exportu.", target: "hlaseni", action: "Zobrazit seznam", icon: "list" }
};

let prefs = readPreferences();
let reports = [];
let reportById = new Map();
let reportCategories = [];
let filtered = [];
let view = "prehled";
let page = 0;
let ascending = false;
let activeGallery = [];
let photoIndex = 0;
let mapBounds = null;
let mapCamera = null;
let drag = null;

function readPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved === "object") {
      return {
        metrics: Array.isArray(saved.metrics) ? metrics.filter(metric => saved.metrics.includes(metric.key)).map(metric => metric.key) : defaults.metrics,
        scope: saved.scope === "all" ? "all" : "filtered",
        trend: saved.trend !== false,
        categories: saved.categories !== false,
        interval: saved.interval === "quarter" ? "quarter" : "month"
      };
    }
  } catch {
    // The current browser may disable storage for file URLs.
  }
  return { ...defaults };
}

function savePreferences() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(prefs));
    $("storage-note").hidden = true;
  } catch {
    $("storage-note").textContent = "Prohlížeč omezuje místní úložiště. Nastavení platí do zavření stránky.";
    $("storage-note").hidden = false;
  }
}

function init(data) {
  reports = data.reports.map(report => {
    const photos = localPhotos(report.files);
    const commentPhotos = commentsOf(report).flatMap(comment => localPhotos(comment.files));
    return {
      ...report, photos, commentPhotos,
      category: categoriesOf(report),
      gps: coordinates(report),
      date: report.created_at?.slice(0, 10) || "",
      searchText: fold(`${report.id} ${report.description ?? ""} ${categoriesOf(report)}`)
    };
  }).sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")) || b.id - a.id);
  reportById = new Map(reports.map(report => [String(report.id), report]));
  reportCategories = [...new Set(reports.map(report => report.category))].sort((a, b) => a.localeCompare(b, "cs"));
  for (const value of [...new Set(reports.map(report => report.status || "(none)"))]) {
    $("status").add(new Option(statusLabel(value === "(none)" ? "" : value), value));
  }
  for (const category of reportCategories) $("category").add(new Option(category, category));
  const retrieved = new Date(data.retrieved_at_utc);
  $("snapshot").textContent = Number.isFinite(+retrieved) ? `Export z ${snapshotDate.format(retrieved)}` : "Místní export";
  const dates = reports.filter(report => report.date);
  $("range").textContent = dates.length ? `${dateLabel(dates.at(-1).date)} – ${dateLabel(dates[0].date)}` : "";
  const points = reports.map(report => report.gps).filter(Boolean);
  if (points.length) {
    const left = Math.min(...points.map(point => point.lon));
    const right = Math.max(...points.map(point => point.lon));
    const top = Math.max(...points.map(point => point.lat));
    const bottom = Math.min(...points.map(point => point.lat));
    mapBounds = { lon: (left + right) / 2, lat: (top + bottom) / 2, width: Math.max((right - left) * 1.12, 0.004), height: Math.max((top - bottom) * 1.12, 0.004) };
    resetCamera();
  }
  bindEvents();
  navigate();
}

function navigate() {
  const hash = location.hash.slice(1);
  if (hash === "main") return;
  view = Object.hasOwn(views, hash) ? hash : "prehled";
  const current = views[view];
  for (const link of document.querySelectorAll("[data-view]")) {
    if (link.dataset.view === view) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  $("breadcrumb").textContent = current.crumb;
  $("title").textContent = current.title;
  $("subtitle").textContent = current.subtitle;
  $("heading-action").href = `#${current.target}`;
  $("heading-action").innerHTML = icon(current.icon) + current.action;
  $("overview").hidden = view !== "prehled";
  $("records-title").textContent = view === "mapa" ? "Podněty na mapě" : "Hlášení";
  $("list-view").hidden = view === "mapa";
  $("map-view").hidden = view !== "mapa";
  render();
  window.scrollTo(0, 0);
}

function currentFilters() {
  const values = ["search", "status", "category", "from", "to", "photos"];
  return Object.fromEntries(values.map(id => [id, $(id).value.trim()]));
}

function hasPhotos(report) {
  return report.photos.length > 0 || report.commentPhotos.length > 0;
}

function render() {
  const filters = currentFilters();
  const query = fold(filters.search).replace(/#/g, "").split(/\s+/).filter(Boolean);
  const invalidDate = filters.from && filters.to && filters.from > filters.to;
  $("date-error").hidden = !invalidDate;
  $("reset").hidden = !Object.values(filters).some(Boolean);
  filtered = invalidDate ? [] : reports.filter(report =>
    query.every(word => report.searchText.includes(word)) &&
    (!filters.status || (report.status || "(none)") === filters.status) &&
    (!filters.category || report.category === filters.category) &&
    (!filters.from || (report.date && report.date >= filters.from)) &&
    (!filters.to || (report.date && report.date <= filters.to)) &&
    (!filters.photos || hasPhotos(report) === (filters.photos === "yes"))
  );
  $("result-count").textContent = number.format(filtered.length);
  if (view === "prehled") renderStatistics(filters);
  if (view === "mapa") renderMap();
  else renderTable();
}

function renderStatistics(filters) {
  const source = prefs.scope === "all" ? reports : filtered;
  const totals = {
    total: source.length,
    open: source.filter(report => report.status === "in_progress").length,
    solved: source.filter(report => report.status === "solved").length,
    photos: source.filter(hasPhotos).length,
    comments: source.reduce((count, report) => count + commentsOf(report).length, 0)
  };
  $("kpis").innerHTML = metrics.filter(metric => prefs.metrics.includes(metric.key)).map(metric => `
    <article class="kpi"><div class="kpi-label"><span class="kpi-icon ${metric.tone}" data-icon>${icon(metric.icon)}</span>${metric.label}</div>
    <strong class="kpi-value">${metric.value(totals)}</strong><small>${metric.note}</small></article>
  `).join("");
  $("charts").hidden = !prefs.trend && !prefs.categories;
  $("charts").classList.toggle("single", prefs.trend !== prefs.categories);
  $("trend-panel").hidden = !prefs.trend;
  $("categories-panel").hidden = !prefs.categories;
  $("interval").value = prefs.interval;
  if (prefs.trend) renderTrend(source, filters);
  if (prefs.categories) renderCategories(source, filters.category);
}

function periodKey(date) {
  const [year, monthNumber] = date.split("-").map(Number);
  return prefs.interval === "quarter" ? `${year}-${Math.ceil(monthNumber / 3)}` : date.slice(0, 7);
}

function periodInfo(key) {
  const [year, unit] = key.split("-").map(Number);
  const firstMonth = prefs.interval === "quarter" ? unit * 3 - 2 : unit;
  const length = prefs.interval === "quarter" ? 3 : 1;
  const start = new Date(Date.UTC(year, firstMonth - 1, 1));
  const end = new Date(Date.UTC(year, firstMonth - 1 + length, 0));
  const label = length === 3 ? `${unit}. čtv.` : month.format(start).replace(/\.$/, "");
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), label, year };
}

function renderTrend(source, filters) {
  const counts = new Map();
  for (const report of source) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(report.date)) continue;
    const key = periodKey(report.date);
    if (!counts.has(key)) counts.set(key, { solved: 0, in_progress: 0, other: 0, total: 0 });
    const bucket = counts.get(key);
    bucket[statusClass(report.status)]++;
    bucket.total++;
  }
  const dates = reports.filter(report => /^\d{4}-\d{2}-\d{2}$/.test(report.date));
  if (!dates.length) {
    $("trend").innerHTML = '<p class="empty">Žádná hlášení k zobrazení.</p>';
    return;
  }
  const first = new Date(`${periodInfo(periodKey(dates.at(-1).date)).from}T00:00:00Z`);
  const end = periodInfo(periodKey(dates[0].date)).to;
  const groups = [];
  for (const date = first; date.toISOString().slice(0, 10) <= end; date.setUTCMonth(date.getUTCMonth() + (prefs.interval === "quarter" ? 3 : 1))) {
    const key = periodKey(date.toISOString());
    groups.push({ ...periodInfo(key), ...counts.get(key) });
  }
  const max = Math.max(...groups.map(group => group.total || 0), 1);
  const rawStep = max / 4;
  const base = 10 ** Math.floor(Math.log10(rawStep));
  const step = Math.max(1, ([1, 2, 2.5, 5, 10].find(size => size * base >= rawStep) || 10) * base);
  const limit = step * 4;
  const ticks = [0, 1, 2, 3, 4];
  const stateKeys = groups.some(group => group.other) ? ["solved", "in_progress", "other"] : ["solved", "in_progress"];
  const legend = stateKeys.map(key => `<span><i class="${key}"></i>${key === "other" ? "Jiný stav" : statusLabel(key)}</span>`).join("");
  const formatYear = groups[0].year !== groups.at(-1).year;
  const bars = groups.map(group => {
    const label = formatYear ? `${group.label} ${String(group.year).slice(-2)}` : group.label;
    const tooltip = `${group.label} ${group.year} · ${number.format(group.total || 0)} celkem · ${stateKeys.map(key => `${key === "other" ? "Jiný stav" : statusLabel(key)} ${group[key] || 0}`).join(" · ")}`;
    const selected = filters.from === group.from && filters.to === group.to;
    return `<button class="bar-button" type="button" data-from="${group.from}" data-to="${group.to}" aria-pressed="${selected}" title="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}">
      <span class="stack" style="height:${100 * (group.total || 0) / limit}%">${stateKeys.map(key => `<i class="${key}" style="flex:${group[key] || 0}"></i>`).join("")}</span><span class="bar-label">${label}</span></button>`;
  }).join("");
  $("trend").innerHTML = `<div class="legend chart-legend">${legend}</div><div class="plot-scroll"><div class="trend" style="min-width:${28 + groups.length * (formatYear ? 53 : 23)}px">
    <div class="axis" aria-hidden="true">${ticks.map(tick => `<span style="top:${100 - tick * 25}%">${number.format(tick * step)}</span>`).join("")}</div>
    <div class="plot">${ticks.map(tick => `<div class="gridline" style="top:${100 - tick * 25}%"></div>`).join("")}<div class="bars" style="grid-template-columns:repeat(${groups.length},1fr)">${bars}</div></div>
  </div></div>`;
}

function renderCategories(source, selected) {
  const counts = new Map(reportCategories.map(category => [category, 0]));
  for (const report of source) counts.set(report.category, counts.get(report.category) + 1);
  const ordered = [...counts].sort((a, b) => b[1] - a[1]);
  const max = ordered[0]?.[1] || 1;
  $("category-chart").innerHTML = ordered.length ? `<div class="categories">${ordered.map(([category, count]) => `
    <button type="button" class="category-bar" data-category="${escapeHtml(category)}" aria-pressed="${selected === category}">
      <span class="category-label"><span>${escapeHtml(category)}</span><strong>${number.format(count)}</strong></span>
      <span class="category-track" aria-hidden="true"><i style="width:${100 * count / max}%"></i></span>
    </button>`).join("")}</div>` : '<p class="empty">Žádné kategorie k zobrazení.</p>';
}

function renderTable() {
  const ordered = ascending ? [...filtered].reverse() : filtered;
  const last = Math.max(0, Math.ceil(ordered.length / pageSize) - 1);
  page = Math.min(page, last);
  const offset = page * pageSize;
  const visible = ordered.slice(offset, offset + pageSize);
  $("date-heading").setAttribute("aria-sort", ascending ? "ascending" : "descending");
  $("sort-arrow").style.transform = ascending ? "rotate(180deg)" : "";
  $("rows").innerHTML = visible.length ? visible.map(report => {
    const photo = report.photos[0] || report.commentPhotos[0];
    const id = escapeHtml(report.id);
    const photoCount = report.photos.length + report.commentPhotos.length;
    const meta = photoCount ? `#${id} · ${number.format(photoCount)} foto` : `#${id}`;
    return `<tr data-report="${id}">
      <td><button class="report" type="button">
        <span class="preview">${photo ? `<img src="${photoPath(photo)}" alt="" loading="lazy" decoding="async">` : icon("list")}</span>
        <span class="report-text"><strong>${escapeHtml(report.description || "Bez popisu")}</strong><small>${meta}</small></span>
      </button></td>
      <td>${escapeHtml(report.category)}</td><td>${badge(report.status)}</td>
      <td><time datetime="${escapeHtml(report.date)}">${dateLabel(report.date)}</time></td>
      <td><span class="row-arrow" aria-hidden="true">${icon("chevron", 15)}</span></td></tr>`;
  }).join("") : '<tr><td colspan="5" class="empty">Zadaným filtrům neodpovídá žádné hlášení.</td></tr>';
  $("pagination").hidden = !ordered.length;
  $("pagination").innerHTML = `
    <span>${number.format(offset + 1)}–${number.format(offset + visible.length)} z ${number.format(ordered.length)}</span>
    <div><button class="button square" id="previous-page" type="button" aria-label="Předchozí stránka" ${page === 0 ? "disabled" : ""}>‹</button>
    <span>Strana ${page + 1} z ${last + 1}</span>
    <button class="button square" id="next-page" type="button" aria-label="Další stránka" ${page >= last ? "disabled" : ""}>›</button></div>`;
}

function detailHeader(title, description) {
  return `<header class="dialog-head"><div><h2 id="detail-title">${title}</h2><p>${description}</p></div>
    <button class="button square close" type="button" data-close aria-label="Zavřít detail">${icon("close")}</button></header>`;
}

function openReport(id) {
  const report = reportById.get(id);
  if (!report) return;
  activeGallery = [];
  const comments = [...commentsOf(report)].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  const author = report.is_anonymous ? "Anonymní" : (report.author_signature || "Neuveden");
  const gps = report.gps ? `${report.gps.lat.toFixed(6)}, ${report.gps.lon.toFixed(6)}` : "Neuvedena";
  const photos = gallery(report.photos, "hlášení");
  const commentHtml = comments.map(comment => {
    const signature = comment.author_signature || (comment.is_author_internal ? "Město Děčín" : "Anonymní");
    const source = comment.is_author_internal ? " · správce" : "";
    const updatedAt = comment.updated_at && comment.updated_at !== comment.created_at ? ` · upraveno ${dateTime(comment.updated_at)}` : "";
    return `<article class="comment"><header>
      <strong>${escapeHtml(signature + source)}</strong>
      <time datetime="${escapeHtml(comment.created_at?.replace(" ", "T"))}">${escapeHtml(dateTime(comment.created_at) + updatedAt)}</time>
      ${comment.status_change ? badge(comment.status_change) : ""}
      </header><p class="original-text">${escapeHtml(comment.text)}</p>
      ${gallery(localPhotos(comment.files), "komentáře")}</article>`;
  }).join("");
  $("detail-body").innerHTML = detailHeader(`Hlášení #${escapeHtml(id)}`, escapeHtml(report.category)) + `
    <div class="drawer-content">
      <dl class="details-meta">
        <div><dt>Stav v exportu</dt><dd>${badge(report.status)}</dd></div>
        <div><dt>Nahlášeno</dt><dd>${escapeHtml(dateTime(report.created_at))}</dd></div>
        <div><dt>Autor</dt><dd>${escapeHtml(author)}</dd></div>
        <div><dt>GPS souřadnice</dt><dd>${gps}</dd></div>
      </dl>
      <section><h3>Popis podnětu</h3><p class="original-text">${escapeHtml(report.description || "Bez popisu")}</p></section>
      ${photos ? `<section><h3>Fotografie hlášení (${report.photos.length})</h3>${photos}</section>` : ""}
      <section><h3>Komentáře (${comments.length})</h3>${commentHtml || '<p class="muted">K hlášení nejsou žádné komentáře.</p>'}</section>
    </div>`;
  showDetail();
}

function showDetail() {
  const detail = $("detail");
  if (!detail.open) detail.showModal();
  detail.scrollTop = 0;
  detail.querySelector("[data-close]").focus();
}

function gallery(files, context) {
  if (!files.length) return "";
  return `<div class="gallery">${files.map((file, index) => {
    const position = activeGallery.length;
    const label = `Fotografie ${context} ${index + 1}`;
    activeGallery.push({ file, label });
    return `<button type="button" data-photo="${position}" aria-label="Zvětšit · ${label}"><img src="${photoPath(file)}" alt="" loading="lazy" decoding="async"></button>`;
  }).join("")}</div>`;
}

function displayPhoto(index) {
  if (index < 0 || index >= activeGallery.length) return;
  photoIndex = index;
  const photo = activeGallery[index];
  $("large-photo").src = photoPath(photo.file);
  $("large-photo").alt = photo.label;
  $("photo-caption").textContent = `${photo.label} · ${index + 1} / ${activeGallery.length}`;
  $("prev-photo").disabled = index === 0;
  $("next-photo").disabled = index === activeGallery.length - 1;
}

function resetCamera() {
  if (!mapBounds) return;
  mapCamera = { lat: mapBounds.lat, lon: mapBounds.lon, zoom: 1 };
}

function mapScale(plot) {
  const longitudeFactor = Math.cos(mapBounds.lat * Math.PI / 180);
  const scale = Math.min(plot.clientWidth / (mapBounds.width * longitudeFactor), plot.clientHeight / mapBounds.height) * mapCamera.zoom;
  return { x: scale * longitudeFactor, y: scale };
}

function gridStep(units) {
  const power = 10 ** Math.floor(Math.log10(units));
  return [1, 2, 5, 10].map(unit => unit * power).find(unit => unit >= units);
}

function gridLines(center, scale, size, axis) {
  const step = gridStep(76 / scale);
  const low = center - size / (2 * scale);
  const high = center + size / (2 * scale);
  const precision = Math.max(2, -Math.floor(Math.log10(step)));
  const format = new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: precision, maximumFractionDigits: precision });
  let lines = "";
  for (let unit = Math.ceil(low / step); unit * step < high; unit++) {
    const displacement = (unit * step - center) * scale;
    const position = size / 2 + (axis === "vertical" ? displacement : -displacement);
    const edge = axis === "vertical" ? "left" : "top";
    lines += `<div class="map-gridline ${axis}" style="${edge}:${position}px"><span>${format.format(unit * step)}°</span></div>`;
  }
  return lines;
}

function renderMap() {
  const plot = $("map-plot");
  const markers = $("map-points");
  const located = filtered.filter(report => report.gps);
  $("zoom-in").disabled = !mapCamera || mapCamera.zoom >= 16;
  $("zoom-out").disabled = !mapCamera || mapCamera.zoom <= 1;
  if (!mapCamera || !plot.clientWidth || !plot.clientHeight) {
    markers.innerHTML = '<p class="empty">Hlášení nemají souřadnice k zobrazení.</p>';
    return;
  }
  const width = plot.clientWidth;
  const height = plot.clientHeight;
  const scale = mapScale(plot);
  const hasBasemap = paintBasemap($("basemap"), { width, height, camera: mapCamera, scale });
  $("map-credit").hidden = !hasBasemap;
  $("map-note").textContent = `${number.format(located.length)} z ${number.format(filtered.length)} hlášení s GPS · ${hasBasemap ? "Offline mapa Děčína a okolí." : "Mapový podklad není k dispozici."} Číslo označuje skupinu hlášení.`;
  const groups = new Map();
  for (const report of located) {
    const x = width / 2 + (report.gps.lon - mapCamera.lon) * scale.x;
    const y = height / 2 - (report.gps.lat - mapCamera.lat) * scale.y;
    if (x < 0 || x > width || y < 0 || y > height) continue;
    const key = `${Math.floor(x / 32)}-${Math.floor(y / 32)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ x, y, report });
  }
  const points = [...groups.values()].map(group => {
    const count = group.length;
    const x = group.reduce((sum, point) => sum + point.x, 0) / count;
    const y = group.reduce((sum, point) => sum + point.y, 0) / count;
    const first = group[0].report;
    const tones = new Set(group.map(point => statusClass(point.report.status)));
    const tone = tones.size > 1 ? "mixed" : statusClass(first.status);
    const label = count > 1 ? `Skupina hlášení (${count})` : `Hlášení #${first.id} · ${statusLabel(first.status)}`;
    const ids = escapeHtml(group.map(point => point.report.id).join(","));
    return `<button type="button" class="map-point ${tone} ${count > 1 ? "cluster" : ""}" data-group="${ids}" style="left:${x}px;top:${y}px" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${count > 1 ? count : ""}</button>`;
  }).join("");
  const grid = hasBasemap ? "" : gridLines(mapCamera.lon, scale.x, width, "vertical") + gridLines(mapCamera.lat, scale.y, height, "horizontal");
  markers.innerHTML = `<div aria-hidden="true">${grid}<span class="map-north">↑ Sever</span></div>
    ${points || '<p class="empty">V zobrazené oblasti nejsou žádná odpovídající hlášení.</p>'}`;
}

function openGroup(ids) {
  if (ids.length === 1) {
    openReport(ids[0]);
    return;
  }
  const buttons = ids.map(id => {
    const report = reportById.get(id);
    return `<article class="comment"><button class="report" type="button" data-report="${escapeHtml(id)}">
      <span class="report-text"><strong>${escapeHtml(report.description)}</strong><small>#${escapeHtml(id)} · ${escapeHtml(report.category)} · ${dateLabel(report.date)}</small></span>
      ${badge(report.status)}</button></article>`;
  }).join("");
  $("detail-body").innerHTML = detailHeader("Hlášení v této skupině", `Počet hlášení · ${number.format(ids.length)}`) + `<div class="drawer-content"><div>${buttons}</div></div>`;
  showDetail();
}

function zoom(factor) {
  if (!mapCamera) return;
  mapCamera.zoom = Math.min(16, Math.max(1, mapCamera.zoom * factor));
  renderMap();
}

function moveCamera(dx, dy) {
  const scale = mapScale($("map-plot"));
  mapCamera.lon -= dx / scale.x;
  mapCamera.lat += dy / scale.y;
  if (window.DECIN_BASEMAP) {
    const [south, west, north, east] = window.DECIN_BASEMAP.bounds;
    mapCamera.lat = Math.max(50 + south / 10000, Math.min(50 + north / 10000, mapCamera.lat));
    mapCamera.lon = Math.max(14 + west / 10000, Math.min(14 + east / 10000, mapCamera.lon));
  }
  renderMap();
}

function fillPreferences(values) {
  $("scope").value = values.scope;
  $("setting-interval").value = values.interval;
  $("show-trend").checked = values.trend;
  $("show-categories").checked = values.categories;
  $("metric-options").innerHTML = metrics.map(metric => `<label><input type="checkbox" value="${metric.key}" ${values.metrics.includes(metric.key) ? "checked" : ""}>${metric.label}</label>`).join("");
}

function updateFilters() {
  page = 0;
  render();
}

function toggleExtra(show) {
  $("extra").hidden = !show;
  $("more").setAttribute("aria-expanded", String(show));
}

function bindEvents() {
  window.addEventListener("hashchange", navigate);
  $("filters").addEventListener("submit", event => event.preventDefault());
  $("search").addEventListener("input", updateFilters);
  for (const id of ["status", "category", "from", "to", "photos"]) $(id).addEventListener("change", updateFilters);
  $("more").addEventListener("click", () => toggleExtra($("extra").hidden));
  $("reset").addEventListener("click", () => {
    for (const id of Object.keys(currentFilters())) $(id).value = "";
    updateFilters();
    $("search").focus();
  });
  $("sort").addEventListener("click", () => {
    ascending = !ascending;
    page = 0;
    renderTable();
  });
  $("pagination").addEventListener("click", event => {
    const id = event.target.closest("button")?.id;
    if (!id) return;
    page += id === "next-page" ? 1 : -1;
    renderTable();
    ($(id).disabled ? $("pagination").querySelector("button:not(:disabled)") : $(id))?.focus();
  });
  $("interval").addEventListener("change", () => {
    prefs.interval = $("interval").value;
    savePreferences();
    renderTrend(prefs.scope === "all" ? reports : filtered, currentFilters());
  });
  $("trend").addEventListener("click", event => {
    const bar = event.target.closest("[data-from]");
    if (!bar) return;
    const clear = bar.getAttribute("aria-pressed") === "true";
    $("from").value = clear ? "" : bar.dataset.from;
    $("to").value = clear ? "" : bar.dataset.to;
    toggleExtra(true);
    updateFilters();
    ($("trend").querySelector(`[data-from="${bar.dataset.from}"]`) || $("from")).focus();
  });
  $("category-chart").addEventListener("click", event => {
    const bar = event.target.closest("[data-category]");
    if (!bar) return;
    const category = bar.dataset.category;
    $("category").value = $("category").value === category ? "" : category;
    updateFilters();
    [...$("category-chart").querySelectorAll("button")].find(button => button.dataset.category === category)?.focus();
  });
  $("settings").addEventListener("click", () => {
    fillPreferences(prefs);
    $("settings-dialog").showModal();
  });
  $("reset-prefs").addEventListener("click", () => fillPreferences(defaults));
  $("preferences").addEventListener("submit", event => {
    event.preventDefault();
    prefs = {
      scope: $("scope").value,
      interval: $("setting-interval").value,
      metrics: [...$("metric-options").querySelectorAll(":checked")].map(input => input.value),
      trend: $("show-trend").checked,
      categories: $("show-categories").checked
    };
    savePreferences();
    $("settings-dialog").close();
    render();
  });
  document.addEventListener("click", event => {
    const close = event.target.closest("[data-close]");
    if (close) close.closest("dialog").close();
    if (event.target instanceof HTMLDialogElement) event.target.close();
    const report = event.target.closest("[data-report]");
    if (report) openReport(report.dataset.report);
    const photo = event.target.closest("[data-photo]");
    if (photo) {
      displayPhoto(Number(photo.dataset.photo));
      $("photo-dialog").showModal();
    }
  });
  $("prev-photo").addEventListener("click", () => displayPhoto(photoIndex - 1));
  $("next-photo").addEventListener("click", () => displayPhoto(photoIndex + 1));
  $("photo-dialog").addEventListener("keydown", event => {
    if (event.key === "ArrowLeft") displayPhoto(photoIndex - 1);
    if (event.key === "ArrowRight") displayPhoto(photoIndex + 1);
  });
  $("zoom-in").addEventListener("click", () => zoom(1.55));
  $("zoom-out").addEventListener("click", () => zoom(1 / 1.55));
  $("map-reset").addEventListener("click", () => {
    resetCamera();
    renderMap();
  });
  const plot = $("map-plot");
  plot.addEventListener("click", event => {
    const marker = event.target.closest("[data-group]");
    if (marker) openGroup(marker.dataset.group.split(","));
  });
  plot.addEventListener("pointerdown", event => {
    if (!mapCamera || event.button !== 0 || event.target.closest("[data-group]")) return;
    drag = { x: event.clientX, y: event.clientY };
    plot.setPointerCapture(event.pointerId);
    plot.classList.add("dragging");
  });
  plot.addEventListener("pointermove", event => {
    if (!drag) return;
    moveCamera(event.clientX - drag.x, event.clientY - drag.y);
    drag = { x: event.clientX, y: event.clientY };
  });
  plot.addEventListener("lostpointercapture", () => {
    drag = null;
    plot.classList.remove("dragging");
  });
  plot.addEventListener("keydown", event => {
    const directions = { ArrowLeft: [55, 0], ArrowRight: [-55, 0], ArrowUp: [0, 55], ArrowDown: [0, -55] };
    if (!mapCamera || event.target !== plot || !Object.hasOwn(directions, event.key)) return;
    event.preventDefault();
    moveCamera(...directions[event.key]);
  });
  new ResizeObserver(() => {
    if (view === "mapa") renderMap();
  }).observe(plot);
}

for (const slot of document.querySelectorAll("[data-icon]")) slot.innerHTML = icon(slot.dataset.icon);
if (Array.isArray(window.MUNIPOLIS_DATA?.reports)) init(window.MUNIPOLIS_DATA);
else {
  $("load-error").hidden = false;
  $("overview").hidden = true;
  $("records").hidden = true;
  $("heading-action").hidden = true;
}
