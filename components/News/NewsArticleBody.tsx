import { load } from "cheerio";

const normalizeText = (value: string): string => value.replace(/\s+/g, " ").trim();

const toSafeHttpUrl = (value: string, baseUrl: string): string | null => {
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const sanitizeArticleHtml = (html: string, title: string, sourceUrl: string): string => {
  const $ = load(html, null, false);

  $("script, style, noscript, iframe, object, embed, form, input, button, nav, header, footer").remove();

  $("*").each((_, element) => {
    const attributes = $(element).attr() || {};
    for (const name of Object.keys(attributes)) {
      if (name.toLowerCase().startsWith("on")) {
        $(element).removeAttr(name);
      }
    }
  });

  const firstHeading = $("h1").first();
  if (firstHeading.length > 0 && normalizeText(firstHeading.text()) === normalizeText(title)) {
    firstHeading.remove();
  }

  $("a[href]").each((_, element) => {
    const link = $(element);
    const href = link.attr("href")?.trim() || "";
    const safeHref = toSafeHttpUrl(href, sourceUrl);
    if (!safeHref) {
      link.removeAttr("href");
      return;
    }
    link.attr("href", safeHref);
    link.attr("target", "_blank");
    link.attr("rel", "noopener noreferrer");
  });

  $("img").each((_, element) => {
    const image = $(element);
    const src = image.attr("src")?.trim() || "";
    const safeSrc = toSafeHttpUrl(src, sourceUrl);
    if (!safeSrc) {
      image.remove();
      return;
    }
    image.attr("src", safeSrc);
    image.removeAttr("srcset");
    image.attr("loading", "lazy");
    image.attr("decoding", "async");
    image.removeAttr("width");
    image.removeAttr("height");
    image.removeAttr("style");
  });

  return $.html();
};

export default function NewsArticleBody({ html, title, sourceUrl }: { html: string; title: string; sourceUrl: string }) {
  return <div className="news-article" dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(html, title, sourceUrl) }} />;
}