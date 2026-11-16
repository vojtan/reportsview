const fs = require("node:fs");
const path = require("node:path");

const source = path.join(__dirname, "..", "reports.json");
const target = path.join(__dirname, "dist", "data.js");
const data = JSON.parse(fs.readFileSync(source, "utf8").replace(/^\uFEFF/, ""));
if (!Array.isArray(data.reports)) {
  throw new Error("reports.json musí obsahovat pole reports.");
}
fs.writeFileSync(target, "window.MUNIPOLIS_DATA = " + JSON.stringify(data) + ";\n", "utf8");
console.log(`Aktualizováno ${data.reports.length} hlášení.`);
