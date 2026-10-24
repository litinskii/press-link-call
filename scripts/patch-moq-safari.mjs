import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const packageFiles = [
  fileURLToPath(new URL("../node_modules/@moq/net/connection/browser.js", import.meta.url)),
  fileURLToPath(new URL("../apps/web/node_modules/@moq/net/connection/browser.js", import.meta.url)),
];
const original = `if (browser.getEngine().name === "WebKit" || browser.getOS().name === "iOS")\n        return false;`;
const patched = `if ((browser.getEngine().name === "WebKit" || browser.getOS().name === "iOS")\n        && globalThis.__PRESS_LINK_CALL_FORCE_WEBTRANSPORT__ !== true)\n        return false;`;

let found = false;
for (const packageFile of packageFiles) {
  let source;
  try {
    source = await readFile(packageFile, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }

  found = true;
  if (source.includes(patched)) continue;
  if (!source.includes(original)) {
    throw new Error(`@moq/net Safari compatibility guard changed in ${packageFile}; review the local WebTransport override`);
  }

  await writeFile(packageFile, source.replace(original, patched));
  console.log(`Applied press-link-call Safari WebTransport override to ${packageFile}`);
}

if (!found) throw new Error("Could not find @moq/net to apply the Safari WebTransport override");
