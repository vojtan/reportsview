const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const [source, ogr = "ogr2ogr"] = process.argv.slice(2);
if (!source) throw new Error("Použití: node prehled/build-basemap.cjs <výřez.osm.pbf> [cesta k ogr2ogr]");

const west = 13.96;
const south = 50.702;
const east = 14.44;
const north = 50.858;
const bounds = [west, south, east, north].map(String);
const mainRoads = ["motorway", "trunk", "primary", "motorway_link", "trunk_link", "primary_link"];
const collectors = ["secondary", "tertiary", "secondary_link", "tertiary_link"];
const localRoads = ["unclassified", "residential", "living_street", "pedestrian"];
const minorRoads = ["service", "cycleway", "path", "footway", "steps", "track"];
const places = ["town", "village", "suburb", "quarter", "neighbourhood"];
const choices = (column, values) => column + " IN (" + values.map(value => "'" + value + "'").join(",") + ")";
const layers = Object.fromEntries(["green", "waterArea", "stream", "river", "rail", "service", "local", "collector", "main"].map(name => [name, []]));

function readLayer(layer, where, clip = true) {
  const output = execFileSync(ogr, [
    "-f", "GeoJSON", "-if", "OSM", "-spat", ...bounds,
    ...(clip ? ["-clipsrc", ...bounds] : []),
    "-where", where, "/vsistdout/", source, layer
  ], { encoding: "utf8", maxBuffer: 40 * 1024 * 1024 });
  return JSON.parse(output).features;
}

function point([lon, lat]) {
  return [Math.round((lon - 14) * 10000), Math.round((lat - 50) * 10000)];
}

function addPath(layer, label, coordinates, minimum) {
  const flattened = [];
  for (const coordinate of coordinates) {
    const [x, y] = point(coordinate);
    if (x !== flattened.at(-2) || y !== flattened.at(-1)) flattened.push(x, y);
  }
  if (flattened.length >= minimum * 2) layers[layer].push([label, flattened]);
}

function geometries(geometry, type, multiType) {
  if (!geometry) return [];
  if (geometry.type === type) return [geometry.coordinates];
  if (geometry.type === multiType) return geometry.coordinates;
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.flatMap(part => geometries(part, type, multiType));
  }
  return [];
}

const lineFilter = [
  choices("highway", [...mainRoads, ...collectors, ...localRoads, ...minorRoads]),
  choices("waterway", ["river", "canal", "stream"]),
  "railway = 'rail'"
].join(" OR ");
for (const { geometry, properties: tags } of readLayer("lines", lineFilter)) {
  let layer = "service";
  if (mainRoads.includes(tags.highway)) layer = "main";
  else if (collectors.includes(tags.highway)) layer = "collector";
  else if (localRoads.includes(tags.highway)) layer = "local";
  else if (tags.railway === "rail") layer = "rail";
  else if (tags.waterway === "river" || tags.waterway === "canal") layer = "river";
  else if (tags.waterway === "stream") layer = "stream";
  for (const line of geometries(geometry, "LineString", "MultiLineString")) {
    addPath(layer, tags.name || null, line, 2);
  }
}

const polygonFilter = "natural = 'water' OR natural = 'wood' OR landuse = 'forest' OR leisure = 'park'";
for (const { geometry, properties: tags } of readLayer("multipolygons", polygonFilter, false)) {
  const layer = tags.natural === "water" ? "waterArea" : "green";
  for (const polygon of geometries(geometry, "Polygon", "MultiPolygon")) {
    for (const ring of polygon) addPath(layer, null, ring, 4);
  }
}

const labels = readLayer("points", "name IS NOT NULL AND " + choices("place", places), false)
  .map(({ geometry, properties: tags }) => [tags.name, tags.place, ...point(geometry.coordinates)]);
if (!layers.local.length || !labels.some(([name]) => name === "Děčín")) {
  throw new Error("Ve výřezu chybí ulice nebo město Děčín.");
}

const region = [...point([west, south]).reverse(), ...point([east, north]).reverse()];
const destination = path.join(__dirname, "dist", "map-data.js");
const data = { bounds: region, layers, places: labels };
fs.writeFileSync(destination, "// OpenStreetMap contributors · ODbL 1.0 · https://www.openstreetmap.org/copyright\nwindow.DECIN_BASEMAP = " + JSON.stringify(data) + ";\n");
console.log(JSON.stringify(Object.fromEntries(Object.entries(layers).map(([name, features]) => [name, features.length]))));
