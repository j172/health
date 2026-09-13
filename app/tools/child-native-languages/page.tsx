import type { Metadata } from "next";
import { Suspense } from "react";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import LoadingOrb from "@/components/ui/LoadingOrb";
import ChildNativeLanguagesContent from "@/components/Dictionary/ChildNativeLanguagesContent";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/child-native-languages`;
const catalogEntry = getToolCatalogEntry("child-native-languages");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "兒少本土語言辭典",
    "臺灣閩南語常用詞辭典",
    "臺灣客家語常用詞辭典",
    "教育部",
    "萌典",
    "臺羅拼音",
    "客家語拼音",
    "鄉土語言教學",
    "母語發音",
    "親子共讀",
  ],
  alternates: { canonical },
  robots: { index: true, follow: true },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function ChildNativeLanguagesPage() {
  return (
    <ToolPageShell
      slug="child-native-languages"
      title={catalogEntry.title}
      maxWidthClassName="max-w-5xl"
    >
      <Suspense
        fallback={
          <div className="flex justify-center py-16">
            <LoadingOrb size={36} />
          </div>
        }
      >
        <ChildNativeLanguagesContent />
      </Suspense>
    </ToolPageShell>
  );
}
