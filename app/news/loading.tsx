import LoadingOrb from "@/components/ui/LoadingOrb";

/**
 * App Router loading boundary for /news — shown while the server renders a
 * new page of results (initial load, or a pagination/filter Link click;
 * PaginationBar/GroupTabs navigate via plain <Link>, so there's no
 * client-side isLoading state to hook into here, only this route segment
 * boundary).
 */
export default function NewsLoading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-slate-50/50 dark:bg-slate-950">
      <LoadingOrb size={32} />
      <p className="text-xs font-medium text-slate-400 dark:text-slate-500">載入新聞中…</p>
    </div>
  );
}
