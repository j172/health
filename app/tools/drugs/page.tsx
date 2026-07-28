import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import DrugsContent from "./DrugsContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/drugs`;

export const metadata: Metadata = {
  title: "藥品查詢",
  description: "查詢衛福部食藥署核准藥品的許可證字號、中英文品名與外觀特徵，協助辨識藥品。",
  keywords: ["藥品查詢", "藥品外觀", "許可證字號", "食藥署"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "藥品查詢", description: "查詢藥品許可證字號、品名與外觀特徵。", url: canonical },
};

export default function DrugsPage() {
  return (
    <ToolPageShell slug="drugs" title="藥品查詢" maxWidthClassName="max-w-4xl">
      <DrugsContent />
    </ToolPageShell>
  );
}
