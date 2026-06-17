#!/usr/bin/env node
// create-kura — scaffold a Kura docs app (the knowledgebase for humans and agents).
//   npm create kura <project-dir>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.join(here, "template");

const CYAN = "\x1b[36m", BOLD = "\x1b[1m", DIM = "\x1b[2m", RESET = "\x1b[0m";

const targetArg = process.argv[2];
if (!targetArg) {
  console.error("usage: npm create kura <project-dir>");
  process.exit(1);
}
const target = path.resolve(targetArg);
const name = path.basename(target).replace(/[^a-z0-9._-]/gi, "-").toLowerCase();

if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
  console.error(`create-kura: target directory "${targetArg}" exists and is not empty.`);
  process.exit(1);
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    // npm strips .gitignore from published tarballs, so it ships as "gitignore".
    const outName = entry.name === "gitignore" ? ".gitignore" : entry.name;
    const to = path.join(dst, outName);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.writeFileSync(to, fs.readFileSync(from, "utf8").replaceAll("PROJECT_NAME", name));
  }
}

copyDir(templateDir, target);

console.log(`
${BOLD}${CYAN}Kura${RESET} ${DIM}— the knowledgebase for humans and agents${RESET}

  Created ${BOLD}${name}${RESET} in ${targetArg}

  Next:
    ${CYAN}cd ${targetArg}${RESET}
    ${CYAN}npm install${RESET}
    ${CYAN}npm run dev${RESET}       ${DIM}# http://localhost:3000${RESET}
    ${CYAN}npm run deploy${RESET}    ${DIM}# ship to Cloudflare Workers${RESET}

  Add Markdown to ${BOLD}content/docs/${RESET}; humans read it, agents call ${BOLD}/mcp${RESET}.
  ${DIM}Search is lexical out of the box; see ${RESET}kura.config.ts${DIM} to enable semantic search.${RESET}
`);
