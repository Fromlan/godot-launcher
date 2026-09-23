#!/usr/bin/env node
/**
 * Generate / update CHANGELOG.md from conventional commits.
 *
 *   node scripts/release-notes.mjs --print       # print updated CHANGELOG to stdout
 *   node scripts/release-notes.mjs --write       # write CHANGELOG.md and RELEASE_NOTES.md to disk
 *
 * Conventional commit types are grouped into sections.
 * Repo URL is taken from $GITHUB_REPOSITORY (CI) or read from git remote (local).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const args = new Set(process.argv.slice(2));
const writeMode = args.has("--write");
const printMode = args.has("--print");

const REPO = process.env.GITHUB_REPOSITORY || readRepoFromGit();
const VERSION = readVersion();
const DATE = new Date().toISOString().slice(0, 10);

const SECTIONS = [
  ["feat", "Features"],
  ["fix", "Bug Fixes"],
  ["perf", "Performance"],
  ["refactor", "Refactors"],
  ["test", "Tests"],
  ["docs", "Documentation"],
  ["build", "Build System"],
  ["ci", "CI"],
  ["chore", "Chores"],
  ["style", "Styles"],
  ["revert", "Reverts"],
  ["other", "Other"],
];

const COMMIT_RE = /^(?<type>[A-Za-z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?:\s*(?<subject>.+)$/;

function readRepoFromGit() {
  try {
    const url = execSync("git remote get-url origin", { cwd: root, encoding: "utf8" }).trim();
    const m = url.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/);
    if (m) return `${m[1]}/${m[2]}`;
  } catch { /* fall through */ }
  return "Fromlan/godot-launcher";
}

function readVersion() {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  return pkg.version;
}

function getLastTag() {
  try {
    return execSync("git describe --tags --abbrev=0", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function getCommits(fromRef) {
  const range = fromRef ? `${fromRef}..HEAD` : "HEAD";
  let raw;
  try {
    raw = execSync(
      `git log ${range} --pretty=format:"%H%x1f%h%x1f%s%x1f%an%x1f%ad" --date=short --no-merges`,
      { cwd: root, encoding: "utf8" }
    );
  } catch (e) {
    console.error(`Failed to read git log: ${e.message}`);
    return [];
  }
  if (!raw.trim()) return [];
  return raw.split("\n").map((line) => {
    const [hash, short, subject, author, date] = line.split("\x1f");
    return { hash, short, subject: subject || "", author: author || "", date: date || "" };
  });
}

function categorize(commits) {
  const buckets = Object.fromEntries(SECTIONS.map(([k]) => [k, []]));
  for (const c of commits) {
    const m = c.subject.match(COMMIT_RE);
    if (!m) {
      buckets.other.push({ ...c, display: c.subject || "(no subject)" });
      continue;
    }
    const type = m.groups.type.toLowerCase();
    const scope = m.groups.scope ? `**${m.groups.scope}**: ` : "";
    const bang = m.groups.bang ? " **BREAKING**" : "";
    const subject = `${scope}${m.groups.subject}${bang}`;
    if (buckets[type]) {
      buckets[type].push({ ...c, display: subject });
    } else {
      buckets.other.push({ ...c, display: subject });
    }
  }
  return buckets;
}

function renderSection(buckets) {
  const lines = [];
  for (const [key, title] of SECTIONS) {
    const items = buckets[key];
    if (!items.length) continue;
    lines.push(`### ${title}`, "");
    for (const it of items) {
      const link = `([${it.short}](https://github.com/${REPO}/commit/${it.hash}))`;
      lines.push(`- ${it.display} ${link}`);
    }
    lines.push("");
  }
  if (lines.length === 0) {
    lines.push("_No notable changes._", "");
  }
  return lines.join("\n");
}

function renderRelease(version, date, buckets) {
  return `## v${version} (${date})\n\n${renderSection(buckets)}`;
}

function renderFullChangelog(version, date, buckets) {
  const header = "# Changelog\n\nAll notable changes to this project will be documented here.\n";
  const entry = renderRelease(version, date, buckets);
  const existingPath = resolve(root, "CHANGELOG.md");
  if (existsSync(existingPath)) {
    const existing = readFileSync(existingPath, "utf8");
    const m = existing.match(/^# [^\n]*\n+([\s\S]*)$/);
    const tail = m ? m[1].trimStart() : existing;
    // 若当前版本段已存在，跳过
    if (new RegExp(`^## v${escapeRegExp(version)}\\b`, "m").test(tail)) {
      console.warn(`CHANGELOG already contains entry for v${version}, leaving existing content intact.`);
      return existing;
    }
    return header + "\n" + entry + "\n" + tail.trim() + "\n";
  }
  return header + "\n" + entry + "\n";
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function main() {
  const lastTag = getLastTag();
  const commits = getCommits(lastTag);
  const buckets = categorize(commits);
  const fullMd = renderFullChangelog(VERSION, DATE, buckets);
  const releaseNotes = renderRelease(VERSION, DATE, buckets);

  if (printMode) {
    process.stdout.write(fullMd);
    return;
  }

  if (writeMode) {
    writeFileSync(resolve(root, "CHANGELOG.md"), fullMd);
    writeFileSync(resolve(root, "RELEASE_NOTES.md"), releaseNotes + "\n");
    console.log(`Wrote CHANGELOG.md and RELEASE_NOTES.md for v${VERSION} (${commits.length} commits since ${lastTag || "beginning"}).`);
  } else {
    process.stdout.write(fullMd);
  }
}

main();