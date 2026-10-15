import {
  buildDataStatusNotice,
  type FacilityDataStatus,
  type FacilityDataStatusConfig,
} from "@/lib/format/facilityDataStatus";
import { appendOutboundUtm } from "@/lib/format/outboundLink";

/**
 * 資料日期 / 「資料暫缺」 notice for facility tools backed by a manually
 * imported source (issue #678, Track B B-8). All wording and the state
 * decision come from the pure, unit-tested buildDataStatusNotice(); this
 * component only lays them out. An unknown status (API failed, or an older
 * API that does not report `dataStatus`) renders nothing rather than guess.
 */
export default function FacilityDataStatusNotice({
  config,
  status,
}: {
  config: FacilityDataStatusConfig;
  status: FacilityDataStatus | null | undefined;
}) {
  const notice = buildDataStatusNotice(config, status);
  if (!notice) return null;

  const sourceLink = notice.sourceUrl ? (
    <a
      href={appendOutboundUtm(notice.sourceUrl, {
        medium: "tool_outbound",
        campaign: "facility_data_status",
        content: "dataset_link",
      })}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold underline"
    >
      查看原始資料集 ↗
    </a>
  ) : null;

  if (notice.state === "missing") {
    return (
      <div
        role="status"
        className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <p className="font-bold">⚠️ {notice.heading}</p>
        <p className="mt-1">{notice.message}</p>
        {sourceLink && <p className="mt-2 text-xs">{sourceLink}</p>}
      </div>
    );
  }

  return (
    <p role="status" className="text-xs text-neutral-500 dark:text-slate-400">
      <strong className="font-semibold text-neutral-700 dark:text-slate-200">{notice.dataDateLabel}</strong>
      {notice.message}
      {sourceLink && <> {sourceLink}</>}
    </p>
  );
}
