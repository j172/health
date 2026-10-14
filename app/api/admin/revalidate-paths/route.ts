import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";

export const runtime = "nodejs";

const MAX_PATHS = 1000;

const isSafeRelativePath = (value: unknown): value is string =>
  typeof value === "string" &&
  value.startsWith("/") &&
  !value.startsWith("//") &&
  value.length <= 512;

/**
 * On-demand ISR invalidation, called by deploy-ftps.yml right after a new
 * build goes live. `next build` runs on a GitHub Actions runner with no
 * database, so every DB-backed ISR page is prerendered from the
 * "[mysql] Falling back to empty data" path — then served (and cached by
 * Cloudflare) as an empty page after each deploy until its `revalidate`
 * window lapses and someone happens to request it. Invalidating everything
 * here lets the deploy's warm-up pass regenerate those pages from the real
 * database before the Cloudflare cache is purged.
 *
 * Body: `{ "scope": "all" }` invalidates every page (root layout), and/or
 * `{ "paths": ["/tools/uv", ...] }` invalidates specific paths.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json().catch(() => ({}))) as {
    scope?: unknown;
    paths?: unknown;
  };

  const paths = Array.isArray(body.paths) ? body.paths.filter(isSafeRelativePath) : [];
  if (paths.length > MAX_PATHS) {
    return NextResponse.json(
      { ok: false, error: `at most ${MAX_PATHS} paths per request` },
      { status: 400 },
    );
  }
  if (body.scope !== "all" && paths.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'pass { "scope": "all" } or a non-empty "paths" array' },
      { status: 400 },
    );
  }

  if (body.scope === "all") revalidatePath("/", "layout");
  for (const path of paths) revalidatePath(path);

  return NextResponse.json({
    ok: true,
    scope: body.scope === "all" ? "all" : "paths",
    revalidatedPaths: paths.length,
  });
}
