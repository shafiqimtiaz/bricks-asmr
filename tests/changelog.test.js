import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/update-changelog.mjs", import.meta.url));

function git(cwd, ...args) {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}
function commit(cwd, file, text, subject, date) {
  writeFileSync(join(cwd, file), text);
  git(cwd, "add", file);
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=t@example.com", "commit", "-m", subject], {
    cwd, stdio: "pipe",
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
}

test("changelog script regenerates the AGENTS.md section from git log", () => {
  const dir = mkdtempSync(join(tmpdir(), "changelog-"));
  git(dir, "init");
  commit(dir, "a.txt", "one\n", "First commit", "2026-11-14T10:00:00Z");
  commit(dir, "b.txt", "two\n", "Second commit", "2026-11-14T11:00:00Z");
  writeFileSync(join(dir, "AGENTS.md"), "# AGENTS.md\n\nHand-written notes.\n\n<!-- changelog:start -->\n## Recent changes (auto-generated)\n\n- stale entry\n<!-- changelog:end -->\n");
  execFileSync("node", [script, dir], { stdio: "pipe" });
  const content = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert.match(content, /Hand-written notes\./);
  assert.match(content, /Second commit/);
  assert.match(content, /First commit/);
  assert.doesNotMatch(content, /stale entry/);
  assert.ok(content.indexOf("Second commit") < content.indexOf("First commit"), "newest first");
  assert.match(content, /<!-- changelog:start -->/);
  assert.match(content, /<!-- changelog:end -->/);
  const again = execFileSync("node", [script, dir], { encoding: "utf8", stdio: "pipe" });
  assert.match(again, /up to date/);
  assert.equal(readFileSync(join(dir, "AGENTS.md"), "utf8"), content);
});

test("changelog script creates AGENTS.md when it is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "changelog-"));
  git(dir, "init");
  commit(dir, "a.txt", "one\n", "Only commit", "2026-11-14T10:00:00Z");
  assert.equal(existsSync(join(dir, "AGENTS.md")), false);
  execFileSync("node", [script, dir], { stdio: "pipe" });
  const content = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert.match(content, /# AGENTS.md/);
  assert.match(content, /Only commit/);
});
