import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// components/Tools/SidebarWidgetShell.tsx is a React/JSX component and this
// repo's test runner has no JSX/DOM rendering harness wired up (see
// tests/useSidebarWidgetData.test.mjs for the same caveat). These checks
// verify, via source inspection, the exact acceptance criteria from
// docs/specs/sidebar-widgets-unified-error-state-refactor.md: a distinct
// "load failed" visual state that is NOT the same markup as the "no data
// today" empty state.

const shellPath = path.join(process.cwd(), "components/Tools/SidebarWidgetShell.tsx");
const shell = fs.readFileSync(shellPath, "utf-8");

test("SidebarWidgetShell exposes a hasError prop distinct from hasData/emptyMessage", () => {
  assert.ok(/hasError\??:\s*boolean/.test(shell), "should declare a hasError prop");
  assert.ok(shell.includes("errorMessage"), "should declare a separate errorMessage prop/default, distinct from emptyMessage");
});

test("SidebarWidgetShell's render order is spinner > data > error > empty, and the error branch is visually distinct from the empty branch", () => {
  // Pull out the body ternary chain between the header and the footer link.
  const bodyMatch = shell.match(/{showSpinner[\s\S]*?<\/div>\s*\)}/);
  assert.ok(bodyMatch, "should find the showSpinner-led conditional body block");
  const body = bodyMatch[0];

  const spinnerIdx = body.indexOf("showSpinner");
  const dataIdx = body.indexOf("hasData");
  const errorIdx = body.indexOf("hasError");
  const emptyIdx = body.lastIndexOf("emptyMessage");

  assert.ok(spinnerIdx < dataIdx, "spinner branch must be checked before the data branch");
  assert.ok(dataIdx < errorIdx, "data branch must be checked before the error branch (stale-but-present data wins over the error placeholder)");
  assert.ok(errorIdx < emptyIdx, "error branch must be checked before falling through to the generic empty branch");

  // The error branch's markup must use different color tokens than the
  // plain empty-state text so the two are visually distinguishable, per
  // the spec's explicit acceptance criterion.
  const errorBranch = body.slice(errorIdx, emptyIdx);
  assert.ok(/text-red-/.test(errorBranch), "error branch should use a distinct (red) color treatment");
  assert.ok(/svg/.test(errorBranch), "error branch should render an icon, not just text");

  const emptyBranch = body.slice(emptyIdx);
  assert.ok(!/text-red-/.test(emptyBranch), "the genuine empty-state branch must NOT reuse the error's red styling");
});

test("SidebarWidgetShell's error state offers a retry affordance", () => {
  const bodyMatch = shell.match(/{showSpinner[\s\S]*?<\/div>\s*\)}/);
  const body = bodyMatch[0];
  const errorIdx = body.indexOf("hasError");
  const emptyIdx = body.lastIndexOf("emptyMessage");
  const errorBranch = body.slice(errorIdx, emptyIdx);
  assert.ok(/onClick=\{onRefresh\}/.test(errorBranch), "error branch should offer a retry button wired to onRefresh");
  assert.ok(/重試|retry/i.test(errorBranch), "retry button should be labeled");
});

test("SidebarWidgetShell makes onRefresh optional (server-props-only widgets have nothing to refresh)", () => {
  assert.ok(/onRefresh\?:/.test(shell), "onRefresh should be an optional prop");
  assert.ok(/{onRefresh\s*&&/.test(shell), "the refresh button should only render when onRefresh is provided");
});
