// src/ の index.html・styles.css・app.js を1ファイルにまとめて dist/index.html を作る。
// ChatGPT Sites など静的ホスティングにそのまま置ける単一HTMLを出力する。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const html = read("src/index.html");
const css = read("src/styles.css");
const js = read("src/app.js");

if (js.includes("</script")) throw new Error("app.js に </script が含まれています");

const linkTag = /<link rel="stylesheet" href="styles\.css" \/?>/;
const scriptTag = /<script src="app\.js"><\/script>/;
if (!linkTag.test(html) || !scriptTag.test(html)) {
  throw new Error("src/index.html に styles.css / app.js の読み込みタグが見つかりません");
}

const out = html
  .replace(linkTag, () => `<style>\n${css}</style>`)
  .replace(scriptTag, () => `<script>\n${js}</script>`);

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/index.html"), out);
console.log(`dist/index.html を出力しました (${(out.length / 1024).toFixed(1)} KB)`);
