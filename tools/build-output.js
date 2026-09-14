const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "public");
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output);
for (const file of fs.readdirSync(root)) {
  if (/\.(html|css|js|png|webp|svg|ico|xml|txt)$/.test(file) && fs.statSync(path.join(root, file)).isFile()) {
    fs.copyFileSync(path.join(root, file), path.join(output, file));
  }
}
for (const folder of ["assets", "auth", "locations", "downloads", "qr-codes"]) {
  fs.cpSync(path.join(root, folder), path.join(output, folder), { recursive: true });
}
console.log("Public site built; API source, tests, tools and secrets excluded from static output.");
