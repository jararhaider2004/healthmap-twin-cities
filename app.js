const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[<>&"]/g, c => `&#${c.charCodeAt(0)};`);
const AREAS = { islamabad: ["Islamabad", 3600358002], rawalpindi: ["Rawalpindi", 3608161545] };
const TYPES = {
  hospital: ["Hospital", "#d92d20"], clinic: ["Clinic", "#1570ef"], pharmacy: ["Pharmacy", "#12b76a"],
  doctors: ["Doctor", "#7a5af8"], dentist: ["Dentist", "#f79009"], laboratory: ["Laboratory", "#0e9384"]
};
const dot = type => `<i class="dot" style="background:${TYPES[type][1]}"></i>`;
let all = [], me = null;

const map = L.map("map").setView([33.65, 73.05], 11);
const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
const hot = L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors, HOT" });
const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: "&copy; Esri" });
const cluster = L.markerClusterGroup().addTo(map), near = L.layerGroup().addTo(map);
L.control.layers({ OpenStreetMap: osm, Humanitarian: hot, Satellite: sat }, { Facilities: cluster }).addTo(map);
L.control.scale().addTo(map);
const legend = L.control({ position: "bottomright" });
legend.onAdd = () => Object.assign(L.DomUtil.create("div", "legend"),
  { innerHTML: "<b>Facility type</b>" + Object.keys(TYPES).map(k => `<div>${dot(k)}${TYPES[k][0]}</div>`).join("") });
legend.addTo(map);
$("cats").innerHTML = Object.keys(TYPES).map(k =>
  `<label><input type="checkbox" value="${k}" checked>${dot(k)}${TYPES[k][0]} <small id="n-${k}"></small></label>`).join("");

const query = id => `[out:json][timeout:60];area(id:${id})->.a;(
  nwr["amenity"~"^(hospital|clinic|pharmacy|doctors|dentist)$"](area.a);
  nwr["healthcare"~"^(hospital|clinic|pharmacy|doctor|dentist|laboratory)$"](area.a););out center tags;`;

async function getArea(key) {
  const [city, id] = AREAS[key];
  let json, live = true;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter",
      { method: "POST", body: "data=" + encodeURIComponent(query(id)), signal: AbortSignal.timeout(40000) });
    if (!res.ok) throw Error();
    json = await res.json();
  } catch {
    json = await (await fetch(`data/${key}.json`)).json();
    live = false;
  }
  const list = json.elements.map(e => {
    const t = e.tags, type = TYPES[t.amenity] ? t.amenity : t.healthcare == "doctor" ? "doctors" : t.healthcare;
    return TYPES[type] && { id: e.type + "/" + e.id, lat: e.lat ?? e.center.lat, lon: e.lon ?? e.center.lon,
      type, city, t, name: t["name:en"] || t.name || "Unnamed " + TYPES[type][0] };
  }).filter(Boolean);
  return { live, list };
}

function popup(f) {
  const t = f.t, rows = {
    City: f.city, Speciality: t["healthcare:speciality"],
    Address: [t["addr:housenumber"], t["addr:street"], t["addr:city:en"] || t["addr:city"]].filter(Boolean).join(", "),
    Phone: t.phone || t["contact:phone"], "Opening hours": t.opening_hours, Emergency: t.emergency,
    Beds: t.beds, Operator: t.operator, Website: t.website
  };
  return `<h3>${esc(f.name)}</h3><span class="tag" style="background:${TYPES[f.type][1]}">${TYPES[f.type][0]}</span><table>` +
    Object.entries(rows).filter(r => r[1]).map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join("") +
    `</table><a href="https://www.openstreetmap.org/${f.id}" target="_blank">View on OpenStreetMap</a>`;
}

function showError(msg) {
  $("errorText").textContent = msg;
  $("error").hidden = false;
}

async function load() {
  $("error").hidden = true;
  $("loading").hidden = false;
  try {
    const keys = $("area").value == "both" ? Object.keys(AREAS) : [$("area").value];
    const res = await Promise.all(keys.map(getArea));
    const live = res.every(r => r.live);
    all = res.flatMap(r => r.list);
    all.forEach(f => f.marker = L.circleMarker([f.lat, f.lon],
      { radius: 7, color: "#fff", weight: 2, fillColor: TYPES[f.type][1], fillOpacity: .95 })
      .bindPopup(() => popup(f)).bindTooltip(esc(f.name)));
    Object.keys(TYPES).forEach(k => $("n-" + k).textContent = `(${all.filter(f => f.type == k).length})`);
    $("source").textContent = (live ? "Source: live Overpass API, " : "Source: saved snapshot, ") + all.length + " facilities";
    if (!live) showError("Live API unavailable, showing saved snapshot.");
    map.fitBounds(all.map(f => [f.lat, f.lon]));
    render();
  } catch (e) {
    showError("Could not load data.");
  }
  $("loading").hidden = true;
}

function render() {
  const q = $("search").value.toLowerCase();
  const types = [...document.querySelectorAll("#cats input:checked")].map(i => i.value);
  let list = all.filter(f => types.includes(f.type) && (!$("emergency").checked || f.t.emergency == "yes") &&
    [f.name, f.t.name, f.t["addr:street"], f.t["healthcare:speciality"]].join(" ").toLowerCase().includes(q));
  if (me) list = list.filter(f => (f.d = me.distanceTo([f.lat, f.lon])) <= 5000).sort((a, b) => a.d - b.d);
  else list.sort((a, b) => a.name.localeCompare(b.name));
  cluster.clearLayers();
  cluster.addLayers(list.map(f => f.marker));
  $("count").textContent = list.length;
  $("results").innerHTML = list.slice(0, 200).map(f =>
    `<li data-id="${f.id}">${dot(f.type)}<div>${esc(f.name)}<small>${TYPES[f.type][0]} · ${f.city}${me ? " · " + (f.d / 1000).toFixed(1) + " km" : ""}</small></div></li>`
  ).join("") || "<li>No facilities match.</li>";
}

$("results").onclick = e => {
  const f = all.find(f => f.id == e.target.closest("li")?.dataset.id);
  if (f) cluster.zoomToShowLayer(f.marker, () => f.marker.openPopup());
  $("sidebar").classList.remove("open");
};

$("nearBtn").onclick = () => {
  if (me) {
    me = null;
    near.clearLayers();
    $("nearBtn").textContent = "Show facilities near me";
    return render();
  }
  navigator.geolocation.getCurrentPosition(p => {
    me = L.latLng(p.coords.latitude, p.coords.longitude);
    map.fitBounds(L.circle(me, { radius: 5000, weight: 1 }).addTo(near).getBounds());
    L.marker(me).addTo(near);
    $("nearBtn").textContent = "Clear near me (5 km)";
    render();
  }, err => showError("Location unavailable: " + err.message));
};

$("resetBtn").onclick = () => {
  $("search").value = "";
  $("emergency").checked = false;
  document.querySelectorAll("#cats input").forEach(i => i.checked = true);
  me ? $("nearBtn").click() : render();
};

$("search").oninput = $("cats").onchange = $("emergency").onchange = render;
$("area").onchange = $("retry").onclick = load;
$("menu").onclick = () => $("sidebar").classList.toggle("open");
load();
