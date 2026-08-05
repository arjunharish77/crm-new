import fs from "node:fs";
import path from "node:path";

// Lets server components render a real <Image> the moment a checklist asset is actually added
// at its documented path, while falling back to the existing placeholder box until then --
// so wiring the real asset in ahead of the file existing doesn't show a broken image.
export function publicAssetExists(publicPath: string): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), "public", publicPath.replace(/^\//, "")));
  } catch {
    return false;
  }
}
