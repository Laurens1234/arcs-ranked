import { favicons } from "favicons";
import { promises as fs } from "node:fs";
import path from "node:path";

const source = path.resolve("favicon.svg");
const outDir = path.resolve(".");

async function writeFileIfChanged(filePath, contents) {
  try {
    const existing = await fs.readFile(filePath);
    if (Buffer.compare(existing, contents) === 0) return;
  } catch {
    // ignore
  }
  await fs.writeFile(filePath, contents);
}

async function main() {
  const configuration = {
    path: "./",
    appName: "Arcs Arsenal",
    appShortName: "Arcs",
    appDescription: "Arcs board game tools - ranked data and custom cards.",
    lang: "en-US",
    background: "transparent",
    theme_color: "#8b5cf6",
    icons: {
      android: true,
      appleIcon: true,
      appleStartup: false,
      favicons: true,
      windows: true,
      yandex: false,
    },
  };

  const response = await favicons(source, configuration);

  await Promise.all(
    response.images.map((image) =>
      writeFileIfChanged(path.join(outDir, image.name), image.contents),
    ),
  );

  await Promise.all(
    response.files.map((file) =>
      writeFileIfChanged(path.join(outDir, file.name), file.contents),
    ),
  );

  // We intentionally do not auto-inject the returned HTML snippet;
  // the site uses handcrafted HTML files.
  console.log(
    `Generated ${response.images.length} images and ${response.files.length} files into ${outDir}`,
  );
}

await main();
