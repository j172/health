import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Legacy URL redirect handler.
 * Redirects visitors of /tools/tax-organizations to /tools/npo-organizations permanently.
 */
export default function LegacyTaxOrganizationsPage() {
  redirect("/tools/npo-organizations");
}
