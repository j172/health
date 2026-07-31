import { Menu } from "@/types/menu";

const menuData: Menu[] = [
  {
    id: 1,
    title: "首頁",
    titleKey: "nav.home",
    newTab: false,
    path: "/",
  },
  {
    id: 2,
    title: "特色功能",
    titleKey: "nav.features",
    newTab: false,
    path: "/#features",
  },
  {
    id: 2.1,
    title: "最新新聞",
    titleKey: "nav.news",
    newTab: false,
    path: "/news",
  },
  {
    id: 2.3,
    title: "說明文件",
    titleKey: "nav.docs",
    newTab: false,
    path: "/docs",
  },
  {
    id: 3,
    title: "頁面指引",
    titleKey: "nav.pages",
    newTab: false,
    submenu: [
      {
        id: 31,
        title: "最新新聞",
        titleKey: "nav.news",
        newTab: false,
        path: "/news",
      },
      {
        id: 34,
        title: "即時地震",
        titleKey: "tools.earthquakes",
        newTab: false,
        path: "/tools/earthquakes",
      },
      {
        id: 35,
        title: "紫外線指數",
        titleKey: "tools.uv",
        newTab: false,
        path: "/tools/uv",
      },
      {
        id: 35.1,
        title: "支援服務",
        titleKey: "nav.support",
        newTab: false,
        path: "/support",
      },
    ],
  },
  {
    id: 4,
    title: "支援服務",
    titleKey: "nav.support",
    newTab: false,
    path: "/support",
  },
];

export default menuData;
