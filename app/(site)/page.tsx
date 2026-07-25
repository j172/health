import { listLatestNews } from "@/lib/server/news/queries";
import StabloNewsLayout from "@/components/News/StabloNewsLayout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Home() {
  const items = await listLatestNews(30);
  return <StabloNewsLayout items={items} variant="home" />;
}
