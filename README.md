# Solid - Free Next.js Web Template and Starter Kit for SaaS

Solid is a free Next.js template specifically crafted for startups, SaaS, and software websites. It provides an extensive array of necessary sections, elements, and pages required to build a fully-equipped website for any SaaS, software, or startup site. Comes with all cutting edge React and Next.js features - **Built with Next.js 16, React 19 and TypeScript.**

This Next.js template's homepage comes with an awesome hero area, logos of associated brands, a features section, an about section, another features section with tabs, counters, and star ratings, integration options, clear call-to-actions, an FAQ section with accordions, a testimonials section, pricing tables, a contact page, a blog, and a distinctive footer.

**Solid Next.js template packed with all necessary external pages** - such as login, registration, blog grids, and single blog pages, among others. This broad collection of pages provides all the necessary tools to create a feature-packed, comprehensive, and visually appealing website or landing page for software, a web application, or SaaS.

### [🔥 Get Solid Pro - Next.js SaaS Boilerplate and Starter Kit](https://nextjstemplates.com/templates/solid)

### [🚀 Solid PRO Live Demo](https://solid.nextjstemplates.com/)

### [🚀 Solid FREE Live Demo](https://solid-free.nextjstemplates.com/)

### Solid PRO vs Solid FREE Comparison 📊

#### [Solid PRO](https://solid.nextjstemplates.com/)

- SaaS Boilerplate + Starter Kit with Essential Integrations and Functionalities
- Essential Integrations: Auth, DB, Stripe, MDX and More ...
- Fully Functional, Ready to Use Sanity Blog Support
- Premium Email Support
- Functional External Pages
- Free Lifetime Future Updates

___

#### [Solid FREE](https://solid-free.nextjstemplates.com/)

- Only UI - Coded for Next.js
- No Integrations
- No Functional Blogging System
- External Pages without Functions/Integrations
- Community Support
- Free Lifetime Future Updates

___

### [📦 Download](https://nextjstemplates.com/templates/solid)

### [🔥 Get Pro](https://nextjstemplates.com/templates/solid)

### [🔌 Documentation](https://nextjstemplates.com/docs)

### ⚡ Deploy Now

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FNextJSTemplates%2Fsolid-nextjs)

[![Deploy with Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/NextJSTemplates/solid-nextjs)

## Installation

Here are the steps you need to follow to install the dependencies.

1.Download and extract the template from **Next.js Templates.**

2.**cd** into the template directory then run this command to install all the dependencies

```bash
    npm install --legacy-peer-deps
```

**Note:** As of right now React 19 causes peer dependencies issues with some packages, so the `legacy-peer-deps` flag is required.

You can start the project on the local server

```bash
    npm run dev
 ```

It’ll start the template on [localhost:3000](http://localhost:3000).

The documentation includes all the guides you need for the integrations.

### Deploying on PaaS

If you are using a GitHub repo then you can go with free-of-cost and easy-to-use options like [Vercel](https://vercel.com/), or [Netlify](https://netlify.com/) they offer decent-free tiers for Next.js hosting.

### 📄 License

Solid Free is 100% free and open-source, feel free to use with your personal and commercial projects.

### 💜 Support

If you like the template, please star this repository to inspire the team to create more stuff like this and reach more users like you!

### ✨ Browse and Download - Best Free [Next.js Templates](https://nextjstemplates.com/templates)

### Update Log

**04 December 2025**

- Upgraded to Next.js 16
- Update swiper to v12

**10 April 2025**

- Update eslint to v9.24.0 to resolve peer deps warning during installation.
- Migrate to tailwind v4

**29 Jan 2025**

- Upgraded to Next.js 15
- Update framer-motion to v12.0.6 for React 19 support.

---

## Health 專案擴充（MOHW RSS → MySQL）

這個專案已新增後端匯入流程：

- 每小時抓取 4 條 RSS
    - `https://www.mohw.gov.tw/rss-16-1.html`
    - `https://www.mohw.gov.tw/rss-17-1.html`
    - `https://www.mohw.gov.tw/rss-18-1.html`
    - `https://www.mohw.gov.tw/rss-101-1.html`
- 解析 RSS 後，再抓每篇詳細頁全文與附件/圖片
- 入庫 MySQL（自動建立 `news_items`、`news_assets`、`ingest_runs`、`ingest_errors`）

### 需要的環境變數

請設定根目錄 `.env`：

- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`
- `MYSQL_SSL`
- `RSS_SYNC_SECRET`（給排程端點）
- `RSS_SYNC_ADMIN_SECRET`（給管理端手動觸發）
- `APP_BASE_URL`

### API 端點

- `GET /api/internal/rss-sync`
    - Header: `x-rss-sync-secret: <RSS_SYNC_SECRET>`
    - 用途：每小時排程呼叫

- `POST /api/admin/rss-sync`
    - Header: `x-rss-sync-admin-secret: <RSS_SYNC_ADMIN_SECRET>`
    - 用途：手動重跑

- `GET /api/admin/ingestion-runs`
    - Header: `x-rss-sync-admin-secret: <RSS_SYNC_ADMIN_SECRET>`
    - 用途：查看最近 20 次匯入紀錄

### 前台頁面

- `GET /news`：新聞列表
- `GET /news/[id]`：新聞詳情（含附件/圖片連結）

### Linux Cron 範例（每小時）

在 VPS 設定 crontab，例如：

```bash
0 * * * * curl -sS -H "x-rss-sync-secret: YOUR_SECRET" https://health.j172.tw/api/internal/rss-sync >/var/log/health-rss-sync.log 2>&1
```

建議再搭配失敗通知（如 Telegram / Email / UptimeRobot webhook）。
