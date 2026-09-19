# 新聞文章內頁 Hero 圖遺失：過時的 http(s) regex 濾掉本機圖片路徑

- **作者**：Claude（診斷會話）
- **日期**：2026-09-20
- **狀態**：Draft
- **對應診斷**：`docs/specs/news-image-pipeline-findings.md` 第 1.4 節、分類 C（100% 可重現，已有具體案例）

## 1. 根因（已確認，直接修，不用重新調查）

`lib/server/news/heroImage.ts` 的 `resolveHeroImage()`：

```ts
const heroAsset = assets.find((asset) => asset.asset_type === "image" && /^https?:\/\//i.test(asset.url));
```

這個 `/^https?:\/\//` 判斷式是 2026-08-18（commit `0efd53a`）之前留下來的邏輯，當時 `news_assets` 的圖片網址都是直接熱連結來源網站的絕對網址。但 2026-07-26 commit `9f6f31a`「Re-host article images locally instead of hotlinking the source site」把 `downloadArticleImage()` 改成回傳站內相對路徑（例如 `/images/news/articles/article-<hash>.jpg`），這個 regex 之後三次修改（`c479879`、`0efd53a`、`4e9663c`）都沒有同步更新，導致所有本機儲存的圖片在這裡被誤判為「不是有效的 http(s) 網址」而被跳過。

**影響範圍**：只影響會在站內渲染文章內頁的來源（政府機關來源，`isGovSource()` 為真——非官方來源的 `/news/[id]` 會直接 302 到原站，根本不會渲染這個 hero）。不影響列表卡片（`CARD_IMAGE_SELECT_SQL` 沒有這個過濾）。

**已驗證的重現案例**：新聞 id `1014118`（國民健康署「買菜動一動」），`/news?group=gov` 的卡片正確顯示 `article-8da7b6a828d3df185888bcb2.jpg`，但 `/news/1014118` 詳情頁完全沒有 hero 圖。

## 2. 修法

放寬 `resolveHeroImage()` 的判斷式，讓它同時接受：
1. 絕對 URL（`http://`/`https://` 開頭，維持現有行為，涵蓋任何尚未被本機化、仍是熱連結的舊資料）。
2. 站內相對路徑（`/` 開頭，例如 `/images/news/articles/...`）——這是目前實際的儲存格式。

修改後仍要確保 `heroAsset.url` 是「可以直接丟給 `<img src>`／`next/image` 使用」的字串，不要接受既非絕對 URL、也非 `/` 開頭的任意字串（避免意外把壞資料當成圖片路徑用）。確認 `components/News/HeroImage.tsx`（`app/news/[id]/page.tsx` 消費 `hero.url` 的元件）本身能正確處理相對路徑（列表卡片的 `CardThumb.tsx` 已經在用同一種相對路徑餵 `next/image`，可以參考其做法是否有額外設定，例如 `next.config.js` 的 `images.remotePatterns`／本地路徑不需要那個設定）。

## 3. 驗收標準

- 新聞 id `1014118` 的文章詳情頁能正確顯示 hero 圖。
- 不影響既有仍是絕對 URL 的舊資料（如果資料庫裡還有舊格式的紀錄，也要能顯示）。
- `npm test`／`npm run build` 通過。若有 `heroImage` 相關的既有測試，一併確認/更新；若無，補一則涵蓋「相對路徑」與「絕對路徑」兩種情況的單元測試。
