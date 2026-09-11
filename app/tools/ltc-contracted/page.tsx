import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function LtcContractedPage() {
  permanentRedirect("/tools/long-term-care");
}
