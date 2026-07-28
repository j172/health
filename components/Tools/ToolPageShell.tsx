import Link from "next/link";
import { buildBreadcrumbJsonLd, getBaseUrl } from "@/lib/server/news/seo";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";

/** Shared wrapper for every /tools/<slug> page — breadcrumb schema, header/footer, and the breadcrumb nav row. */
export default function ToolPageShell({
  slug,
  title,
  children,
  maxWidthClassName = "max-w-2xl",
}: {
  slug: string;
  title: string;
  children: React.ReactNode;
  maxWidthClassName?: string;
}) {
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}/tools/${slug}`;
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "首頁", url: baseUrl },
    { name: "健康工具", url: `${baseUrl}/tools` },
    { name: title, url: canonical },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <div className="min-h-screen bg-white text-neutral-800">
        <StabloHeader />

        <main className={`mx-auto px-4 py-12 sm:px-6 lg:px-8 ${maxWidthClassName}`}>
          <nav className="mb-6 text-sm text-neutral-500" aria-label="breadcrumb">
            <Link href="/" className="hover:text-neutral-900">
              首頁
            </Link>
            <span className="mx-2" aria-hidden="true">
              /
            </span>
            <Link href="/tools" className="hover:text-neutral-900">
              健康工具
            </Link>
            <span className="mx-2" aria-hidden="true">
              /
            </span>
            <span aria-current="page">{title}</span>
          </nav>

          {children}
        </main>

        <StabloFooter />
      </div>
    </>
  );
}
