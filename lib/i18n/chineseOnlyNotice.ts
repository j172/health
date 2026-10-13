import type { PathLocale } from "./dictionary";

/**
 * Text for the dismissible "this page's content is only available in
 * Chinese" notice (issue #485, acceptance criterion 5) — shown after the
 * language switcher is used on a page with no real translation, in
 * whichever locale the UI chrome just switched to (since the nav/footer
 * already changed language even though this page's body didn't).
 */
export function getChineseOnlyNoticeText(locale: PathLocale): string {
  switch (locale) {
    case "en":
      return "This page's content is only available in Chinese for now. The menus and interface switched language, but this page's own content has not been translated yet.";
    case "ja":
      return "このページの内容は現在、中国語のみでご利用いただけます。メニューとインターフェースの言語は切り替わりましたが、このページ自体の内容はまだ翻訳されていません。";
    case "ko":
      return "이 페이지의 콘텐츠는 현재 중국어로만 제공됩니다. 메뉴와 인터페이스 언어는 전환되었지만, 이 페이지 자체의 콘텐츠는 아직 번역되지 않았습니다.";
  }
}

export function getChineseOnlyNoticeDismissLabel(locale: PathLocale): string {
  switch (locale) {
    case "en":
      return "Dismiss";
    case "ja":
      return "閉じる";
    case "ko":
      return "닫기";
  }
}
