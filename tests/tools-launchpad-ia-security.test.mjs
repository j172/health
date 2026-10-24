import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = new URL("../", import.meta.url);

process.env.MYSQL_HOST ||= "localhost";
process.env.MYSQL_USER ||= "test";
process.env.MYSQL_PASSWORD ||= "test";
process.env.MYSQL_DATABASE ||= "test";
process.env.RSS_SYNC_ADMIN_SECRET ||= "test-secret-123456";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    if (specifier === "next/server") {
      return {
        url: "data:text/javascript,export class NextResponse extends Response { static json(body, init) { return new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...(init && init.headers) } }); } static redirect(url, status = 307) { return new Response(null, { status: typeof status === 'number' ? status : 307, headers: { Location: String(url) } }); } } export class NextRequest extends Request {}",
        shortCircuit: true,
      };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const {
  generateAdminSessionToken,
  isValidAdminSessionToken,
} = await import("../lib/server/config/adminAuth.ts");

const { internalErrorResponse } = await import(
  "../lib/server/http/errorResponse.ts"
);

test("adminAuth: generateAdminSessionToken generates HMAC-SHA256 hex string", () => {
  const token = generateAdminSessionToken("test-secret");
  assert.equal(typeof token, "string");
  assert.equal(token.length, 64, "SHA256 hex digest should be 64 characters");
  assert.match(token, /^[0-9a-f]{64}$/);
});

test("adminAuth: isValidAdminSessionToken returns false for invalid or null token", () => {
  assert.equal(isValidAdminSessionToken(null), false);
  assert.equal(isValidAdminSessionToken(undefined), false);
  assert.equal(isValidAdminSessionToken(""), false);
  assert.equal(isValidAdminSessionToken("tampered-token-value"), false);
});

test("adminAuth: enter route sets HMAC token in cookie, never raw secret", () => {
  const enterRouteContent = fs.readFileSync(
    path.join(ROOT_DIR, "app", "(zh)", "admin", "social-queue", "enter", "route.ts"),
    "utf-8",
  );
  assert.match(
    enterRouteContent,
    /generateAdminSessionToken\(key as string\)/,
    "must call generateAdminSessionToken for cookie value",
  );
  assert.doesNotMatch(
    enterRouteContent,
    /response\.cookies\.set\([^,]+,\s*key\s*as\s*string/,
    "must NEVER store raw key in cookies",
  );
});

test("adminAuth: social-queue page verifies session with isValidAdminSessionToken", () => {
  const pageContent = fs.readFileSync(
    path.join(ROOT_DIR, "app", "(zh)", "admin", "social-queue", "page.tsx"),
    "utf-8",
  );
  assert.match(
    pageContent,
    /isValidAdminSessionToken\(sessionToken\)/,
    "must use isValidAdminSessionToken to verify cookie",
  );
});

test("errorResponse: masks error details in production", async () => {
  const oldEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    const secretDbError = new Error("SELECT * FROM users WHERE password_hash = 123");
    const res = internalErrorResponse(secretDbError, "發生內部伺服器錯誤");
    const json = await res.json();

    assert.equal(res.status, 500);
    assert.equal(json.ok, false);
    assert.equal(json.error, "發生內部伺服器錯誤");
    assert.doesNotMatch(json.error, /password_hash/);
  } finally {
    process.env.NODE_ENV = oldEnv;
  }
});

test("middleware: sets security headers and handles permanent redirects", () => {
  const middlewareContent = fs.readFileSync(
    path.join(ROOT_DIR, "middleware.ts"),
    "utf-8",
  );
  assert.match(middlewareContent, /Strict-Transport-Security/);
  assert.match(middlewareContent, /X-Frame-Options/);
  assert.match(middlewareContent, /X-Content-Type-Options/);
  assert.match(middlewareContent, /Referrer-Policy/);
});

test("healthz: api route exists and responds", async () => {
  const healthzPath = path.join(ROOT_DIR, "app", "api", "healthz", "route.ts");
  assert.ok(fs.existsSync(healthzPath), "app/api/healthz/route.ts must exist");

  const { GET } = await import("../app/api/healthz/route.ts");
  const res = await GET();
  const json = await res.json();
  assert.equal(json.status, "ok");
  assert.ok(json.timestamp);
});

test("launchpad components: ToolLaunchpad, ToolsIndexClient, SubToolStickyNav exist", () => {
  assert.ok(
    fs.existsSync(path.join(ROOT_DIR, "components", "Home", "ToolLaunchpad.tsx")),
    "ToolLaunchpad.tsx must exist",
  );
  assert.ok(
    fs.existsSync(path.join(ROOT_DIR, "components", "Tools", "ToolsIndexClient.tsx")),
    "ToolsIndexClient.tsx must exist",
  );
  assert.ok(
    fs.existsSync(path.join(ROOT_DIR, "components", "Tools", "SubToolStickyNav.tsx")),
    "SubToolStickyNav.tsx must exist",
  );
  assert.ok(
    fs.existsSync(path.join(ROOT_DIR, "lib", "client", "analytics.ts")),
    "analytics.ts must exist",
  );
  assert.ok(
    fs.existsSync(path.join(ROOT_DIR, "components", "Analytics", "AnalyticsTracker.tsx")),
    "AnalyticsTracker.tsx must exist",
  );
});

test("analytics tracker is mounted in (zh) and [locale] root layouts", () => {
  const zhLayout = fs.readFileSync(path.join(ROOT_DIR, "app", "(zh)", "layout.tsx"), "utf-8");
  const localeLayout = fs.readFileSync(path.join(ROOT_DIR, "app", "[locale]", "layout.tsx"), "utf-8");

  assert.match(zhLayout, /<AnalyticsTracker \/>/);
  assert.match(localeLayout, /<AnalyticsTracker \/>/);
});
