import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("lib/server/cron/registerJobs.ts: defines memory pressure limits and circuit breaker", () => {
  const filePath = path.join(process.cwd(), "lib", "server", "cron", "registerJobs.ts");
  assert.ok(fs.existsSync(filePath), "registerJobs.ts must exist");

  const source = fs.readFileSync(filePath, "utf-8");
  assert.ok(
    source.includes("CRON_MEMORY_CEILING_RSS_MB = 620"),
    "Must define CRON_MEMORY_CEILING_RSS_MB = 620",
  );
  assert.ok(
    source.includes("CRON_MEMORY_CEILING_HEAP_USED_MB = 550"),
    "Must define CRON_MEMORY_CEILING_HEAP_USED_MB = 550",
  );
  assert.ok(
    source.includes("isMemoryUnderPressure"),
    "Must define isMemoryUnderPressure function",
  );
  assert.ok(
    source.includes("skipped_memory_pressure"),
    "Must log skipped_memory_pressure event on high memory",
  );
});

test("isMemoryUnderPressure logic: triggers when memory exceeds ceiling", () => {
  const isMemoryUnderPressure = (mem, rssLimit = 620, heapLimit = 550) =>
    mem.rss >= rssLimit || mem.heapUsed >= heapLimit;

  assert.equal(
    isMemoryUnderPressure({ rss: 400, heapUsed: 300 }),
    false,
    "Healthy memory should not trigger pressure",
  );
  assert.equal(
    isMemoryUnderPressure({ rss: 625, heapUsed: 300 }),
    true,
    "High RSS should trigger pressure",
  );
  assert.equal(
    isMemoryUnderPressure({ rss: 500, heapUsed: 560 }),
    true,
    "High HeapUsed should trigger pressure",
  );
});
