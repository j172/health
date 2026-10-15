import Link from "next/link";
import { appendOutboundUtm } from "@/lib/format/outboundLink";

/**
 * issue #573: 戒菸頁新增新興菸品（電子煙／加熱菸）法規重點、喪屍煙彈警示、合法
 * 加熱菸品項清單、檳榔與口腔癌四個靜態宣導區塊。全部是人工整理的靜態內容，
 * 不經資料庫、不跑同步排程——與同頁上方的戒菸院所查詢（FacilitySearchContent）
 * 是兩個完全獨立的資料來源，這個元件本身沒有任何 fetch 或狀態。
 *
 * 內容查證（2026-10-14）：
 * - 電子煙全面禁止、罰則：衛生福利部《菸害防制法》修正公告
 *   https://www.mohw.gov.tw/fp-16-73548-1.html（自112年3月22日施行）。
 * - 依托咪酯（喪屍煙彈主成分）改列第一級毒品：行政院115年6月27日公告修正
 *   「毒品之分級及品項」，各媒體（ETtoday、UDN、公視）均於6月27日同步報導
 *   生效首日全國查緝行動，法務部反毒資源網 https://antidrug.moj.gov.tw/
 *   為權責機關的持續性宣導入口。
 * - 檳榔屬 WHO 國際癌症研究機構（IARC）認定之第一類（Group 1）人類致癌物。
 */

/**
 * 國健署「指定菸品健康風險評估審查」目前（2026-10-14 查證）只有 2 家業者、
 * 共 14 個品項取得有條件通過核定。國健署「菸品成分資料網」公布的正式清單
 * 本身只露出業者名稱的第一個字（如「菲○○○」「傑○○○」），其餘逐項品名一律
 * 以核定識別碼管理，不對外公開完整品名——這是官方清單本身的呈現方式，不是
 * 本頁省略掉的資訊，所以下面只能整理到「業者＋品項數＋核定生效日」這個顆粒度。
 *
 * 下列業者全名是依新聞報導中揭露的品項數、組合元件數與核定生效日比對回填
 * （8 品項／3 組合元件對應「菲○○○」、6 品項對應「傑○○○」），不是官方清單
 * 逐字抄錄，準確度仰賴媒體報導交叉比對。協調者合併前請再以國健署「菸品成分
 * 資料網」或衛福部新聞稿核對一次公司全名是否正確。
 *
 * 這份清單需要人工半年更新一次，不是自動同步——國健署沒有提供結構化開放
 * 資料，新業者或新品項通過審查後要重新查證官網並手動更新這個陣列。
 * TODO(協調者)：列入每半年人工檢查清單，或另開一張追蹤 issue。
 */
const APPROVED_HEATED_TOBACCO_BATCHES = [
  {
    company: "菲利普莫里斯（美商，公司全名待核對）",
    itemCount: 8,
    comboElementCount: 3,
    effectiveDate: "2025-10-11",
    note: "114年9月12日初步核定8項菸草柱，同年10月11日完成上市前文件核定生效，為首波合法開賣的加熱菸業者。",
  },
  {
    company: "傑太日煙國際股份有限公司（日商，公司全名待核對）",
    itemCount: 6,
    comboElementCount: 8,
    effectiveDate: "2025-10-19",
    note: "6項菸草柱另含組合元件，114年10月19日核定生效。",
  },
] as const;

const CONDITIONAL_APPROVAL_ANNOUNCED_DATE = "2025-07-29";
const HEATED_TOBACCO_LIST_VERIFIED_DATE = "2026-10-14";

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
        <span>{icon}</span>
        <span>{title}</span>
      </h2>
      <div className="mt-3 space-y-3 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
        {children}
      </div>
    </section>
  );
}

function SourceLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] text-slate-500 dark:text-slate-500">
      資料來源：{children}
    </p>
  );
}

export default function SmokingAwarenessContent() {
  return (
    <div className="mt-8 space-y-6">
      {/* 新興菸品法規重點 */}
      <SectionCard icon="📜" title="新興菸品法規重點：電子煙全面禁止、加熱菸限制上市">
        <ul className="list-disc space-y-2 pl-4">
          <li>
            <strong>電子煙全面禁止</strong>
            ：現行《菸害防制法》禁止任何人製造、輸入、販賣、供應、展示或廣告電子煙等類菸品及其組合元件。製造或輸入業者違法最高可處新臺幣
            5,000 萬元罰鍰；一般使用者違法使用，可處新臺幣 2,000 元至 1 萬元罰鍰。
          </li>
          <li>
            <strong>加熱菸須經審查核准才合法</strong>
            ：加熱菸屬「指定菸品」，業者必須先通過國健署「指定菸品健康風險評估審查」取得核定，才能合法製造、輸入或販售；目前只有通過審查的少數品項合法上市（見下方清單），
            <strong>其餘所有未經核定的加熱菸品項，一律屬違法產品</strong>。
          </li>
          <li>
            <strong>未滿 20 歲禁止使用</strong>
            ：菸害防制法將可合法使用菸品（含電子煙、加熱菸）的年齡提高到 20 歲，未滿 20 歲者不得使用任何菸品。
          </li>
          <li>
            發現違法電子煙、加熱菸的製造、輸入、販賣或廣告，可撥打菸害諮詢及檢舉服務專線{" "}
            <a href="tel:0800531531" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
              0800-531-531
            </a>{" "}
            （24 小時免付費）或向所在地衛生局檢舉。
          </li>
        </ul>
        <SourceLine>
          <a
            href={appendOutboundUtm("https://www.mohw.gov.tw/fp-16-73548-1.html", {
              medium: "tool_content",
              campaign: "smoking_awareness",
              content: "tobacco_law_mohw",
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-700 underline hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
          >
            衛生福利部《菸害防制法》修正公告
          </a>
          （自 112 年 3 月 22 日施行）、
          <a
            href={appendOutboundUtm("https://www.hpa.gov.tw/", {
              medium: "tool_content",
              campaign: "smoking_awareness",
              content: "tobacco_law_hpa",
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-700 underline hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
          >
            衛生福利部國民健康署
          </a>
          「指定菸品健康風險評估審查」專區。
        </SourceLine>
      </SectionCard>

      {/* 喪屍煙彈警示 */}
      <SectionCard icon="🧟" title="喪屍煙彈警示：偽裝成電子煙的新興毒品">
        <p>
          「喪屍煙彈」是近年出現的新興毒品型態，通常偽裝成一般電子煙油或現成煙彈販售，主要成分為
          <strong>依托咪酯（Etomidate）</strong>
          ——原本是醫療用的中樞神經鎮靜／麻醉藥物，被混入電子煙油後成為毒品。吸食者常出現神智恍惚、肢體僵硬遲緩、對外界反應遲鈍等狀態，因而被稱為「喪屍」煙彈。
        </p>
        <p>
          依托咪酯的毒品分級在短時間內快速提升：民國 113 年 8 月公告列管、同年 11 月提升為第二級毒品，到了民國 115 年
          6 月 27 日，行政院再次公告修正「毒品之分級及品項」，將依托咪酯提升為
          <strong>第一級毒品</strong>
          （與海洛因、嗎啡同級）。
        </p>
        <p>
          依《毒品危害防制條例》，第一級毒品的法律責任相當重：
          製造、運輸、販賣可處<strong>死刑或無期徒刑</strong>
          ；單純持有可處 3 年以下有期徒刑、拘役或新臺幣 30 萬元以下罰金；
          施用則可處 6 個月以上 5 年以下有期徒刑。
        </p>
        <p>
          家長或老師如果發現孩子持有來源不明、外觀像一般電子煙油或煙彈的物品，應提高警覺並盡快求助，可撥打法務部戒毒成功專線{" "}
          <a href="tel:0800770885" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
            0800-770-885
          </a>{" "}
          （24 小時免付費），或在本站「成癮防治」地圖查詢鄰近的藥癮戒治機構與毒品危害防制中心。
        </p>
        <SourceLine>
          <a
            href={appendOutboundUtm("https://antidrug.moj.gov.tw/", {
              medium: "tool_content",
              campaign: "smoking_awareness",
              content: "zombie_vape_moj",
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-700 underline hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
          >
            法務部反毒資源網
          </a>
          ；行政院 115 年 6 月 27 日公告修正「毒品之分級及品項」（依托咪酯改列第一級毒品）。
        </SourceLine>
      </SectionCard>

      {/* 合法加熱菸品項清單 */}
      <SectionCard icon="🚬" title="合法加熱菸品項清單（依國健署公告整理）">
        <p>
          國健署於 {CONDITIONAL_APPROVAL_ANNOUNCED_DATE} 公布首波「指定菸品健康風險評估審查」結果，共 2 家業者、14 個品項「有條件通過」核定；上市前仍需再經最後審查，上市後業者須定期提交監視與管控報告，未履行者最重可廢止核定。
        </p>
        <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-50 text-slate-600 dark:bg-slate-850 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">業者</th>
                <th scope="col" className="px-3 py-2 font-semibold">核定品項數</th>
                <th scope="col" className="px-3 py-2 font-semibold">核定生效日</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {APPROVED_HEATED_TOBACCO_BATCHES.map((batch) => (
                <tr key={batch.company}>
                  <td className="px-3 py-2">{batch.company}</td>
                  <td className="px-3 py-2">
                    {batch.itemCount} 項菸草柱 ／ {batch.comboElementCount} 項組合元件
                  </td>
                  <td className="px-3 py-2">{batch.effectiveDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-500">
          國健署官方清單只公開業者名稱首字與核定識別碼，不逐項公開個別品名；上表業者全名為新聞報導比對回填，請以國健署「菸品成分資料網」公布的正式識別碼清單為準。
          <strong> 此清單查證日期：{HEATED_TOBACCO_LIST_VERIFIED_DATE}，需每半年人工覆核更新一次，非自動同步。</strong>
          除上表 2 家業者、14 個品項外，市面上其他任何加熱菸品項（包含網路販售）均屬未經核定、違法產品。
        </p>
        <SourceLine>
          <a
            href={appendOutboundUtm("https://www.hpa.gov.tw/", {
              medium: "tool_content",
              campaign: "smoking_awareness",
              content: "heated_tobacco_hpa",
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-700 underline hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
          >
            衛生福利部國民健康署「指定菸品健康風險評估審查」公告
          </a>
          ；《菸害防制法》第 7 條第 3 項授權訂定之「指定菸品健康風險評估審查辦法」。
        </SourceLine>
      </SectionCard>

      {/* 檳榔與口腔癌 */}
      <SectionCard icon="🦷" title="檳榔與口腔癌">
        <p>
          檳榔經世界衛生組織（WHO）所屬國際癌症研究機構（IARC）認定為
          <strong>第一類（Group 1）人類致癌物</strong>
          ，不論是否添加荖花、荖藤，長期嚼食都會顯著提高罹患口腔癌的風險，口腔黏膜白斑、纖維化等病變也常是癌前病變的徵兆。
        </p>
        <p>
          30 歲以上有嚼檳榔或吸菸習慣的民眾，建議每 2 年接受 1 次公費口腔黏膜檢查，及早發現癌前病變。可到{" "}
          <Link href="/tools/adult-preventive-care" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
            成人健檢與公費癌症篩檢院所查詢
          </Link>{" "}
          工具查詢鄰近提供口腔黏膜篩檢服務的特約院所。
        </p>
        <SourceLine>
          <a
            href={appendOutboundUtm("https://www.iarc.who.int/", {
              medium: "tool_content",
              campaign: "smoking_awareness",
              content: "betel_nut_iarc",
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-700 underline hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
          >
            WHO 國際癌症研究機構（IARC）致癌物分類
          </a>
          ；衛生福利部國民健康署成人預防保健服務作業指引（口腔黏膜檢查對象與頻率）。
        </SourceLine>
      </SectionCard>
    </div>
  );
}
