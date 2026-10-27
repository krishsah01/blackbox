import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { RingLog, serverArgs, spawnDrained, waitHealthy, phrase, PHRASE_SYSTEM } from "../src/model/local.ts";

test("serverArgs pins the model and never adds a web UI", () => {
  const args = serverArgs({ bin: "x", hf: "org/repo:Q4_K_M", host: "127.0.0.1", port: 1, ctxSize: 8 });
  assert.deepEqual(args, ["-hf", "org/repo:Q4_K_M", "--host", "127.0.0.1", "--port", "1", "--ctx-size", "8", "--no-webui"]);
  assert.throws(() => serverArgs({ bin: "x", host: "h", port: 1, ctxSize: 8 }), /one of hf or model/);
});

test("a child that floods stderr past the pipe buffer still exits (pipes are drained)", async () => {
  // 1 MiB of stderr, far past the 64 KiB pipe buffer that blocks an undrained child.
  const { child, log } = spawnDrained(process.execPath, [
    "-e",
    "const s='x'.repeat(65536); for (let i=0;i<16;i++) process.stderr.write(s); process.stderr.write('\\nDONE\\n');",
  ]);
  const [code] = (await Promise.race([
    once(child, "exit"),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("child hung")), 10_000)),
  ])) as [number];
  assert.equal(code, 0);
  assert.match(log.text(), /DONE/);
  assert.ok(log.text().length <= 64 * 1024 + 8, "ring log is bounded");
});

test("RingLog keeps the tail", () => {
  const l = new RingLog(10);
  l.write("aaaaa");
  l.write("bbbbb");
  l.write("cc");
  assert.equal(l.text(), "bbbbbcc");
});

test("waitHealthy returns when /health is ok and fails when the process exited", async () => {
  const srv = createServer((req, res) => {
    res.statusCode = req.url === "/health" ? 200 : 404;
    res.end("ok");
  });
  srv.listen(0, "127.0.0.1");
  await once(srv, "listening");
  const port = (srv.address() as { port: number }).port;
  await waitHealthy(`http://127.0.0.1:${port}`, 5000);
  await assert.rejects(waitHealthy(`http://127.0.0.1:${port}`, 5000, { exited: true }), /exited/);
  srv.close();
});

test("phrase sends the engine answer as data and returns the model's text", async () => {
  let seen: { messages: Array<{ role: string; content: string }> } | undefined;
  const srv = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      seen = JSON.parse(body);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ model: "fake-3b", choices: [{ message: { content: "Two commits landed [commit:a]." } }] }));
    });
  });
  srv.listen(0, "127.0.0.1");
  await once(srv, "listening");
  const port = (srv.address() as { port: number }).port;
  const out = await phrase(`http://127.0.0.1:${port}`, {
    question: "what happened today",
    lead: "On 2026-10-27: 2 commits.",
    steps: [{ text: "02:42 commit a: Start", cites: ["commit:a"] }],
    label: "supported",
    inputs: {},
  });
  assert.equal(out.text, "Two commits landed [commit:a].");
  assert.equal(out.model, "fake-3b");
  assert.equal(seen?.messages[0]?.role, "system");
  assert.equal(seen?.messages[0]?.content, PHRASE_SYSTEM);
  assert.match(seen?.messages[1]?.content ?? "", /1\. 02:42 commit a: Start \[commit:a\]/);
  srv.close();
});
