/**
 * Pure helpers for the registerJobs.ts "no two jobs on the same tick" lint
 * (docs/2.0/track-b-opendata-phase2-3-spec.md §4 item 3, issue #669 B-0).
 *
 * Kept as plain ESM (no TypeScript, no imports) so a `node --test` file can
 * load it directly. Nothing here talks to node-cron: the goal is only to
 * answer "could these two five-field expressions ever fire in the same
 * minute?", which is exactly the question that keeps going wrong when jobs
 * are added from independent PRs (everyone picks a "free" minute by reading a
 * different snapshot of registerJobs.ts).
 */

const FIELDS = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "dayOfMonth", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  // cron accepts both 0 and 7 for Sunday; 7 is folded into 0 below.
  { name: "dayOfWeek", min: 0, max: 7 },
];

const parseInteger = (text, field, expression) => {
  if (!/^\d+$/.test(text)) {
    throw new Error(
      `Unsupported token "${text}" in ${field.name} field of cron expression "${expression}" ` +
        `(only numbers, lists, ranges, steps and * are supported — extend cronCollisions.mjs if a job needs more)`,
    );
  }
  const value = Number(text);
  if (value < field.min || value > field.max) {
    throw new Error(
      `Value ${value} is outside ${field.min}-${field.max} for the ${field.name} field of cron expression "${expression}"`,
    );
  }
  return value;
};

/** Expands one field (`*`, `5`, `1,15`, `0-6`, `*\/10`, `3-30/9`) to the set of values it matches. */
export const expandCronField = (fieldText, field, expression = fieldText) => {
  const values = new Set();
  for (const part of fieldText.split(",")) {
    if (part === "") {
      throw new Error(`Empty list item in ${field.name} field of cron expression "${expression}"`);
    }
    const [rangeText, stepText, ...extra] = part.split("/");
    if (extra.length > 0) {
      throw new Error(`Malformed step "${part}" in cron expression "${expression}"`);
    }
    let step = 1;
    if (stepText !== undefined) {
      step = parseInteger(stepText, { ...field, min: 1 }, expression);
    }

    let start;
    let end;
    if (rangeText === "*") {
      start = field.min;
      end = field.max;
    } else if (rangeText.includes("-")) {
      const [startText, endText, ...rest] = rangeText.split("-");
      if (rest.length > 0) {
        throw new Error(`Malformed range "${rangeText}" in cron expression "${expression}"`);
      }
      start = parseInteger(startText, field, expression);
      end = parseInteger(endText, field, expression);
      if (start > end) {
        throw new Error(`Descending range "${rangeText}" in cron expression "${expression}"`);
      }
    } else {
      start = parseInteger(rangeText, field, expression);
      // "5/10" means "from 5, every 10, to the end of the field" in cron.
      end = stepText !== undefined ? field.max : start;
    }

    for (let value = start; value <= end; value += step) {
      values.add(field.name === "dayOfWeek" && value === 7 ? 0 : value);
    }
  }
  return values;
};

/** Parses a five-field cron expression into one Set of matching values per field. */
export const parseCronExpression = (expression) => {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(
      `Cron expression "${expression}" has ${parts.length} fields; the collision lint only understands the 5-field form`,
    );
  }
  const parsed = {};
  FIELDS.forEach((field, index) => {
    parsed[field.name] = expandCronField(parts[index], field, expression);
  });
  return parsed;
};

const intersection = (a, b) => [...a].filter((value) => b.has(value));

/**
 * The minutes (0-59) at which two expressions could fire in the same tick, or
 * an empty array when they never can. Day-of-month and day-of-week are
 * compared independently and conservatively: two jobs "may share a day" when
 * their day-of-month sets overlap AND their day-of-week sets overlap, which is
 * how a `1 * *` job and a `* * 6` job end up flagged (they do coincide on any
 * Saturday the 1st).
 */
export const sharedTickMinutes = (expressionA, expressionB) => {
  const a = typeof expressionA === "string" ? parseCronExpression(expressionA) : expressionA;
  const b = typeof expressionB === "string" ? parseCronExpression(expressionB) : expressionB;
  for (const name of ["hour", "dayOfMonth", "month", "dayOfWeek"]) {
    if (intersection(a[name], b[name]).length === 0) return [];
  }
  return intersection(a.minute, b.minute).sort((x, y) => x - y);
};

const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .split("\n")
    .map((line) => (/^\s*\/\//.test(line) ? "" : line))
    .join("\n");

/**
 * Pulls every `cron.schedule("<expr>", ...)` call out of registerJobs.ts
 * source text. Comments are blanked first (registerJobs.ts has many comments
 * that quote other jobs' expressions), but line numbers are preserved. The job
 * name is the `runGuarded("<name>.log"` argument that follows the expression;
 * `line N` is the fallback for a job that doesn't use runGuarded.
 *
 * Throws if any `cron.schedule(` call takes something other than a string
 * literal first, because then the expression can't be linted statically and a
 * silent skip would defeat the point.
 */
export const extractCronSchedules = (source) => {
  const code = stripComments(source);
  const totalCalls = (code.match(/\bcron\.schedule\s*\(/g) || []).length;
  const jobs = [];
  const pattern = /\bcron\.schedule\s*\(\s*"([^"]*)"/g;
  let match;
  while ((match = pattern.exec(code)) !== null) {
    const expression = match[1];
    const line = code.slice(0, match.index).split("\n").length;
    const tail = code.slice(pattern.lastIndex, pattern.lastIndex + 400);
    const named = /runGuarded\s*\(\s*"([^"]+)"/.exec(tail);
    jobs.push({ expression, name: named ? named[1] : `line ${line}`, line });
  }
  if (jobs.length !== totalCalls) {
    throw new Error(
      `Found ${totalCalls} cron.schedule( calls but only ${jobs.length} with a string-literal expression; ` +
        `the collision lint can't read schedules built any other way — use a literal`,
    );
  }
  return jobs;
};

/** Every pair of jobs that can fire in the same tick, with the shared minutes. */
export const findCronCollisions = (jobs) => {
  const parsed = jobs.map((job) => ({ job, cron: parseCronExpression(job.expression) }));
  const collisions = [];
  for (let i = 0; i < parsed.length; i += 1) {
    for (let j = i + 1; j < parsed.length; j += 1) {
      const minutes = sharedTickMinutes(parsed[i].cron, parsed[j].cron);
      if (minutes.length > 0) {
        collisions.push({ a: parsed[i].job, b: parsed[j].job, minutes });
      }
    }
  }
  return collisions;
};

/**
 * Minutes of the hour (0-59) that no job's minute field mentions at any hour —
 * the safest candidates for a new job, and what the lint's failure message
 * suggests. Deliberately stricter than "not the same tick": a minute that is
 * free of every other job is also free of whatever job gets added next.
 */
export const unusedMinutes = (jobs) => {
  const used = new Set();
  for (const job of jobs) {
    for (const minute of parseCronExpression(job.expression).minute) used.add(minute);
  }
  return Array.from({ length: 60 }, (_, minute) => minute).filter((minute) => !used.has(minute));
};

/** Order-independent identity of a colliding pair, e.g. `a-cron.log <> b-cron.log`. */
export const collisionKey = (collision) =>
  [collision.a.name, collision.b.name].sort().join(" <> ");
