// Regenerates the auto-generated "Recent changes" section in AGENTS.md from
// `git log`, so the next agent can see what happened without digging through
// history. Run by .github/workflows/changelog.yml on every push to main and
// on release creation; safe to run by hand too.
//
// Usage: node scripts/update-changelog.mjs [repo-dir]
//   repo-dir defaults to the repo root (the parent of scripts/).
// The section is bounded to the newest 30 commits and the file is only
// written when the section actually changes, so repeated runs are no-ops.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(dir, "AGENTS.md");
const START = "<!-- changelog:start -->";
const END = "<!-- changelog:end -->";
const LIMIT = 30;

const raw = execFileSync("git", ["-C", dir, "log", "--format=%ad%x09%h%x09%s", "--date=short", `-${LIMIT}`], { encoding: "utf8" }).trim();
const entries = raw
  ? raw.split("\n").map((line) => {
      const [date, hash, ...rest] = line.split("\t");
      return `- ${date} \`${hash}\` ${rest.join("\t")}`;
    })
  : [];
const section = `## Recent changes (auto-generated)\n\nUpdated automatically on every push to main by \`.github/workflows/changelog.yml\`. Newest first. Full history: \`git log\`.\n\n${entries.join("\n") || "_No commits yet._"}\n`;
const block = `${START}\n${section}${END}`;

let content = existsSync(file) ? readFileSync(file, "utf8") : "";
if (!content) {
  content = `# AGENTS.md\n\nAgent notes for bricks-asmr (Bricks ASMR: a brick-breaker game served from Cloudflare Workers).\n\n- Main branch deploys live to bricks.shafq.dev. Work on main; pull before pushing, the owner pushes his own commits often.\n- \`npm test\` runs the suite (\`node --test\`).\n- \`src/\` holds the game (solo.html, multiplayer.html, multi.js, engine.js, game-core.js); \`tests/\` holds the suite.\n\n${block}\n`;
} else if (content.includes(START) && content.includes(END)) {
  content = content.slice(0, content.indexOf(START)) + block + content.slice(content.indexOf(END) + END.length);
} else {
  content = content.replace(/\s*$/, "\n\n") + block + "\n";
}

if (existsSync(file) && readFileSync(file, "utf8") === content) {
  console.log("changelog: up to date");
} else {
  writeFileSync(file, content);
  console.log(`changelog: updated ${file} (${entries.length} entries)`);
}
