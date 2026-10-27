#!/usr/bin/env node
/**
 * blackbox: the CLI.
 *
 *   blackbox intake all [repo]      git history, doc versions and decisions into the brain
 *   blackbox intake git [repo]      git history only
 *   blackbox ask "<question>"       answer from memories, with citations
 *   blackbox ask "<q>" --phrase     same, then phrased by the local model (nothing leaves)
 *   blackbox model status           is the local model up, and which weights
 *   blackbox status                 what the brain holds
 *   blackbox rebuild                replay the event log into the derived tables
 *
 * The brain lives in ./data (gitignored) unless BLACKBOX_DATA says otherwise.
 */
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { Store } from "../src/store.ts";
import { intakeGit, readCommits } from "../src/intake/git.ts";
import { intakeDocs, readDocVersions } from "../src/intake/docs.ts";
import { intakeDecisionsFromVersions } from "../src/intake/decisions.ts";
import { ask, render } from "../src/ask.ts";
import { NAME, VERSION } from "../src/version.ts";
import { DEFAULT_LOCAL_MODEL, modelInfo, phrase } from "../src/model/local.ts";

const dataDir = resolve(process.env.BLACKBOX_DATA ?? "data");
const dbPath = resolve(dataDir, "blackbox.sqlite");
const denylistFile = resolve(dataDir, "denylist");
const baseUrl = process.env.BLACKBOX_MODEL_URL ?? `http://${DEFAULT_LOCAL_MODEL.host}:${DEFAULT_LOCAL_MODEL.port}`;

function usage(): never {
  console.error(`${NAME} ${VERSION}
usage:
  blackbox intake all|git [repo]
  blackbox ask "<question>" [--json] [--phrase]
  blackbox model status
  blackbox status
  blackbox rebuild`);
  process.exit(2);
}

async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean", default: false },
      phrase: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });
  if (values.help || positionals.length === 0) usage();
  const [cmd, sub, ...rest] = positionals;
  const store = new Store(dbPath, { denylistFile });
  try {
    switch (cmd) {
      case "intake": {
        if (sub !== "git" && sub !== "all") usage();
        const repo = resolve(rest[0] ?? ".");
        const r = await intakeGit(store, repo);
        console.log(
          `${repo}: +${r.commits} commits, +${r.branches} branches, +${r.links} links; ${r.skipped} already known; ${r.redactions} redactions`,
        );
        if (sub === "all") {
          const commits = await readCommits(repo);
          const d = await intakeDocs(store, repo, commits);
          console.log(`docs: +${d.versions} versions, +${d.links} links; ${d.skipped} already known`);
          const versions = (await readDocVersions(repo, commits)).filter((v) => /(^|\/)DECISIONS\.md$/.test(v.path));
          const dec = intakeDecisionsFromVersions(store, versions, `git:${repo}`);
          console.log(`decisions: ${dec.decisions} ids, +${dec.versions} versions, +${dec.links} links; ${dec.skipped} already known`);
        }
        break;
      }
      case "ask": {
        const question = [sub, ...rest].filter(Boolean).join(" ");
        if (!question) usage();
        const a = ask(store, question);
        console.log(values.json ? JSON.stringify(a, null, 2) : render(a));
        if (values.phrase) {
          const info = await modelInfo(baseUrl);
          const p = await phrase(baseUrl, a);
          console.log(`\nPhrased by ${info.model} (local, nothing left this machine, ${p.ms} ms):\n${p.text}`);
        }
        break;
      }
      case "status": {
        const kinds = store.db
          .prepare("SELECT kind, COUNT(*) AS n FROM memories GROUP BY kind ORDER BY kind")
          .all() as Array<{ kind: string; n: number }>;
        const links = store.db.prepare("SELECT how, COUNT(*) AS n FROM links GROUP BY how").all() as Array<{ how: string; n: number }>;
        console.log(`store: ${dbPath}`);
        console.log(`events: ${store.eventCount()}`);
        console.log(`memories: ${kinds.map((k) => `${k.n} ${k.kind}`).join(", ") || "none"}`);
        console.log(`links: ${links.map((l) => `${l.n} ${l.how}`).join(", ") || "none"}`);
        console.log(`newest: ${store.newest() ?? "none"}`);
        break;
      }
      case "model": {
        if (sub !== "status") usage();
        try {
          const info = await modelInfo(baseUrl);
          console.log(`local model up at ${baseUrl}: ${info.model}`);
        } catch (e) {
          console.log(`local model not reachable at ${baseUrl} (${(e as Error).message})`);
          console.log(`start it with: llama-server ${DEFAULT_LOCAL_MODEL.hf ? `-hf ${DEFAULT_LOCAL_MODEL.hf}` : ""} --host ${DEFAULT_LOCAL_MODEL.host} --port ${DEFAULT_LOCAL_MODEL.port} --ctx-size ${DEFAULT_LOCAL_MODEL.ctxSize} --no-webui`);
          process.exitCode = 1;
        }
        break;
      }
      case "rebuild": {
        console.log(`replayed ${store.rebuild()} events`);
        break;
      }
      default:
        usage();
    }
  } finally {
    store.close();
  }
}

main(process.argv.slice(2)).catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
