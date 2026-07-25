import Link from "next/link";
import { listLatestNews } from "@/lib/server/news/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const toTaipei = (value: Date | null): string => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(new Date(value));
};

export default async function NewsPage() {
  const items = await listLatestNews(80);

  return (
    <section className="pt-28 pb-16">
      <div className="container mx-auto px-4">
        <h1 className="mb-3 text-3xl font-bold text-white">衛福部新聞彙整</h1>
        <p className="mb-8 text-gray-300">每小時同步：焦點新聞、即時新聞澄清、公告訊息、活動訊息</p>

        <div className="overflow-x-auto rounded-lg border border-white/10 bg-white/5">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-gray-300">
                <th className="px-4 py-3">類別</th>
                <th className="px-4 py-3">標題</th>
                <th className="px-4 py-3">單位</th>
                <th className="px-4 py-3">時間（台北）</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-white/5 text-gray-100 hover:bg-white/5">
                  <td className="px-4 py-3 whitespace-nowrap">{item.feed_name}</td>
                  <td className="px-4 py-3">
                    <Link href={`/news/${item.id}`} className="hover:text-primary">
                      {item.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{item.dept_name || "-"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{toTaipei(item.published_at_utc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}