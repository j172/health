/**
 * 聯盟（推薦）連結的單一來源（issue #746, #797）。
 *
 * 這裡的網址是「原樣」使用的：**絕對不可**經過 `appendOutboundUtm()`，
 * 也不可附加任何額外參數，否則會污染聯盟的追蹤歸因。
 * 站內其他外部連結會自動附加 UTM（issue #451），聯盟連結是刻意的例外，
 * 例外清單見 tests/outbound-link-coverage.test.mjs 的 DYNAMIC_HREF_ALLOWLIST。
 *
 * 日後更換推薦網址，只需改這裡的常數。
 */

export interface RecommendedAffiliateLink {
  readonly id: string;
  readonly name: string;
  readonly url: string;
}

export const RECOMMENDED_AFFILIATE_LINKS: readonly RecommendedAffiliateLink[] = [
  {
    id: "hawkhost",
    name: "Hawk Host",
    url: "https://my.hawkhost.com/aff.php?aff=18170&utm_source=j172.tw",
  },
  {
    id: "hahow",
    name: "Hahow",
    url: "https://hahow.in/ur/j172?utm_source=j172.tw",
  },
  {
    id: "uber",
    name: "Uber",
    url: "https://www.uber.com/invite/sgyal?utm_source=j172.tw",
  },
  {
    id: "klook",
    name: "Klook",
    url: "https://www.klook.com/zh-TW/invite/D3ZWFN?c=TWD&utm_source=j172.tw",
  },
  {
    id: "duolingo",
    name: "Duolingo",
    url: "https://invite.duolingo.com/profile-share/j172tw?via=share_profile_qr",
  },
] as const;

export const HAWKHOST_REFERRAL_URL = RECOMMENDED_AFFILIATE_LINKS[0].url;

/**
 * 聯盟連結的 rel：`sponsored`（付費／聯盟連結，Google 規範）＋ `nofollow`，
 * 加上新視窗開啟必備的 `noopener noreferrer`。
 */
export const AFFILIATE_LINK_REL = "sponsored nofollow noopener noreferrer";
