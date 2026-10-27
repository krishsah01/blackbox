import { test } from "node:test";
import assert from "node:assert/strict";
import { NAME, VERSION } from "../src/version.ts";

test("the package knows its name and version", () => {
  assert.equal(NAME, "blackbox");
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});
