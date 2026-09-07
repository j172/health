// Stand-in for @/lib/server/net/httpClient used only by
// fetchMoenvNews.test.mjs (via the module-resolution hook in that file).
// Tests set mockState.responses.{mnews,inews,podcast} before calling
// fetchMoenvNews() so each of the three data.moenv.gov.tw endpoints can be
// scripted independently, without ever touching the real network.
export const mockState = {
  responses: {
    mnews: { status: 200, text: "[]" },
    inews: { status: 200, text: "[]" },
    podcast: { status: 200, text: "[]" },
  },
};

export const httpGetText = async (url) => {
  if (url.includes("mnews_p_10")) return mockState.responses.podcast;
  if (url.includes("inews_s_01")) return mockState.responses.inews;
  if (url.includes("mnews_p_01")) return mockState.responses.mnews;
  return { status: 404, text: "" };
};
