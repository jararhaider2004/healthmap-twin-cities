# HealthMap Twin Cities: API-Based Web GIS of Healthcare Facilities

**Assignment No. 2 (Theory): API-Based Web GIS Application**
**Selected application:** 2. Healthcare facilities
**Study area:** Islamabad Capital Territory and Rawalpindi District, Pakistan

---

## 1. Overview

HealthMap Twin Cities is a small Web GIS website built with HTML, CSS and JavaScript. When the page opens it requests
hospitals, clinics, pharmacies, doctors, dentists and laboratories from the **OpenStreetMap Overpass API** with
`fetch()`. It parses the JSON response and shows each facility on an interactive **Leaflet** map. Users can
search, filter by facility type, filter for emergency departments, and list the facilities within 5 km of their own
location. Clicking a marker or a list entry opens a popup with that facility's attributes.

There is no database or backend server. The browser talks to the public API directly.

## 2. Study area

Islamabad, the federal capital, and Rawalpindi, in Punjab, are the "twin cities". Together they form one continuous
urban region of more than 5 million people. Residents of both cities use the same hospitals. Islamabad residents often
go to hospitals in Rawalpindi such as the Holy Family Hospital and Benazir Bhutto Hospital, and Rawalpindi residents go
to PIMS and Shifa International in Islamabad. The two areas are therefore mapped together. The user can still pick one
city on its own.

| Area | OSM boundary used | Overpass area id |
|---|---|---|
| Islamabad | Islamabad Capital Territory (relation 358002, admin_level 4) | 3600358002 |
| Rawalpindi | Rawalpindi District (relation 8161545, admin_level 6) | 3608161545 |

An Overpass area id is `3600000000 + relation id`.

## 3. The API

| Item | Detail |
|---|---|
| API | Overpass API, a read-only query service for OpenStreetMap data |
| Endpoint | `https://overpass-api.de/api/interpreter` |
| Method | HTTP `POST` with the query in a `data=` form field |
| Response format | JSON (`[out:json]`) |
| Authentication | None. No API key is required, so none is stored in or exposed by the code. |
| Licence / terms | Data © OpenStreetMap contributors, Open Database Licence (ODbL). Attribution is shown on the map and in the side panel. Public Overpass servers ask for moderate use, so the app makes only one request per area. |
| Coverage | OSM is mapped by volunteers. Large hospitals are well mapped. Small clinics and pharmacies are often missing, and many records have only a name and a type. |

### The query

```
[out:json][timeout:60];
area(id:3600358002)->.searchArea;
(
  nwr["amenity"~"^(hospital|clinic|pharmacy|doctors|dentist)$"](area.searchArea);
  nwr["healthcare"~"^(hospital|clinic|pharmacy|doctor|dentist|laboratory)$"](area.searchArea);
);
out center tags;
```

- `nwr` searches nodes, ways (building outlines) and relations.
- Two tagging schemes are used in OSM for health facilities, the older `amenity=*` and the newer `healthcare=*`, so
  both are queried and the results combined.
- `out center tags` returns a single centre point for buildings/areas, plus all attribute tags.

### Example response (one element, translated city names removed)

```json
{
  "osm3s": { "timestamp_osm_base": "2026-10-25T12:25:39Z" },
  "elements": [
    {
      "type": "way",
      "id": 23040333,
      "center": { "lat": 33.6759211, "lon": 73.0667951 },
      "tags": {
        "amenity": "hospital",
        "name": "Shifa International Hospital",
        "addr:street": "Pitras Bukhari Road",
        "addr:city:en": "Islamabad",
        "phone": "+92-51-846-3000",
        "email": "info@shifa.com.pk",
        "website": "https://www.shifa.com.pk/contact/"
      }
    }
  ]
}
```

Here `type: "way"` means the hospital is mapped as a building outline, so Overpass gives its `center` point.

## 4. Data fields used

| OSM tag | Meaning | Where it is used |
|---|---|---|
| `lat`, `lon` / `center.lat`, `center.lon` | Coordinates (WGS84) | Marker position |
| `amenity` / `healthcare` | Facility type | Marker colour, type filter, legend |
| `name`, `name:en` | Name (local / English) | Popup title, list, search |
| `addr:housenumber`, `addr:street`, `addr:city` | Address | Popup, search (street) |
| `healthcare:speciality` | Medical speciality (e.g. dentistry, ophthalmology) | Popup, search |
| `phone`, `contact:phone` | Phone number | Popup |
| `opening_hours` | Opening times | Popup |
| `emergency` | Has an emergency department (`yes`/`no`) | Popup, "emergency only" filter |
| `beds` | Number of beds | Popup |
| `operator` | Who runs the facility | Popup |
| `website` | Website address | Popup |

The six facility types and their counts in the saved snapshot (25 October 2026):

| Type | Colour | Count |
|---|---|---|
| Hospital | red | 186 |
| Pharmacy | green | 92 |
| Clinic | blue | 44 |
| Doctor | purple | 16 |
| Dentist | orange | 9 |
| Laboratory | teal | 4 |
| **Total** | | **351** |

## 5. Steps used to display the data

1. **Map setup** (top of `app.js`): Leaflet creates the map, centred on the twin cities. Three basemaps
   (OpenStreetMap, Humanitarian, Esri satellite), a layer switcher, a scale bar and a legend are added.
2. **Build the query** (`query`): the Overpass QL query above is created for the selected area id.
3. **Fetch** (`getArea`): `fetch()` sends a `POST` request, which is cancelled after 40 seconds. When
   "Islamabad + Rawalpindi" is selected, both areas are requested in parallel with `Promise.all`.
4. **Parse JSON** (`res.json()`, then `map` in `getArea`): each element becomes a simple object. Coordinates come from
   `lat/lon` for nodes or from `center` for buildings. The facility type is read from `amenity`, or from `healthcare`
   if `amenity` is missing. Elements without a recognised type are dropped.
5. **Display** (`load`): each facility becomes a coloured `L.circleMarker`. Markers are grouped with
   Leaflet.markercluster so 350 points stay readable. A tooltip shows the name on hover.
6. **Popup** (`popup`): clicking a marker opens a popup with the attributes from section 4 and a link to
   openstreetmap.org. Text from the API is HTML-escaped before display.
7. **User interaction** (`render`):
   - **Area selector**: switch between Islamabad, Rawalpindi or both. A new API request is made for the new area.
   - **Search box**: matches name, street and speciality.
   - **Type checkboxes**: show or hide each facility type. Each checkbox shows its count.
   - **Emergency filter**: only facilities tagged `emergency=yes`.
   - **Near me**: uses the browser's Geolocation API to list facilities within 5 km, sorted by distance.
   - **Results list**: clicking a result zooms to the facility and opens its popup.
8. **Loading states and errors** (`load`, `showError`):
   - A spinner overlay is shown while data is loading.
   - An error box with a "Try again" button appears if data cannot be loaded.
   - If the live API fails, the app loads a saved copy of the same Overpass response from `data/`, shows "Live API
     unavailable, showing saved snapshot", and the side panel says "Source: saved snapshot". When the live API works,
     the panel says "Source: live Overpass API".

## 6. Project files

```
Assignment2_WebGIS_Healthcare/
├── index.html                    page layout: title, study area, filters, map
├── style.css                     styling, including mobile layout
├── app.js                        API requests, JSON parsing, map, filters
├── data/
│   ├── islamabad.json            saved Overpass response (fallback only)
│   └── rawalpindi.json           saved Overpass response (fallback only)
└── README.md                     this report
```

Libraries (loaded from the unpkg CDN): Leaflet 1.9.4 and Leaflet.markercluster 1.5.3.

## 7. How to run

Because the app loads files with `fetch()`, open it through a local web server, not by double-clicking the file:

```bash
cd Assignment2_WebGIS_Healthcare
python -m http.server 8000
```

Then open <http://localhost:8000> in a browser.

### Publishing a working demonstration (GitHub Pages)

1. Create a public GitHub repository and upload the contents of this folder.
2. In the repository, go to **Settings > Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. After about a minute the site is live at `https://<username>.github.io/<repository>/`.

No API key is used, so the code is safe to publish.

## 8. Limitations

- **Completeness of OSM data**: many small clinics and pharmacies in both cities are not yet mapped, and many mapped
  ones have only a name. The map shows what OSM contains, not every facility that exists.
- **Server availability**: the public Overpass servers are run by volunteers and are sometimes overloaded. During
  testing on 25 October 2026 the server often returned HTTP 502 or timed out, which is why the snapshot fallback was
  added.
- **Rawalpindi District** includes rural tehsils beyond the city itself, so some facilities lie outside the urban
  area.

## 9. Data source and attribution

- Facility data: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL, accessed via the
  [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API).
- Basemaps: © OpenStreetMap contributors; Humanitarian style by HOT; satellite imagery © Esri and its partners.
- Map library: [Leaflet](https://leafletjs.com/) (BSD-2-Clause); clustering: Leaflet.markercluster (MIT).
