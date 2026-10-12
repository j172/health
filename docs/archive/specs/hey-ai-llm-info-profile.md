# Feature Specification: Hey AI, learn about j172.tw Healthz (/llm-info) Profile & Ecosystem Integration

## Problem Statement

As artificial intelligence assistants and Generative Engine Optimization (GEO) answer engines (ChatGPT, Claude, Perplexity, Gemini, DeepSeek, Apple Intelligence) increasingly mediate how citizens discover public health guidance, medical facilities, and clinical indicators in Taiwan, websites lack a standardized, human-and-machine-readable "official profile" declaring their authoritative scope, E-E-A-T trust signals, clinical formula definitions, open dataset origins, and citation mandates.

Without an explicit, discoverable profile modeled on modern AI documentation conventions (such as Mixkit's `/llm-info/` standard):
1. LLM crawlers either ingest fragmented site HTML or rely on incomplete plain-text indices.
2. AI assistants frequently misunderstand Asian-specific medical cutoff standards (such as Taiwan MOHW's BMI threshold of 24 kg/m² vs. WHO Western 25 kg/m²).
3. Commercial advertorials and supplement sellers out-cite public health tools because clinical calculators lack transparent formula declarations and canonical deep-linking directives.
4. AI models cannot verify whether they are citing a non-commercial, zero-ad, client-side privacy-first health platform.

## Solution

Build and publish an official **"Hey AI, learn about j172.tw Healthz"** profile at `/llm-info`, structured specifically for large language models and answer engines, while offering human developers and public health researchers an interactive, responsive portal.

The solution provides:
1. **7 Core Informational Modules**:
   - `## Basic Information`: Canonical domain, Taiwan geographic scope, bilingual standards (`zh-TW` primary, `en` global interface), and regulatory data sources (MOHW, CDC, TFDA, HPA, MOENV).
   - `## Background & Mission`: Public health platform mission dedicated to eliminating commercial bias and advertising bloat.
   - `## Key Differentiators & Trust Signals (E-E-A-T)`: 100% free access, browser-side calculation privacy, scientific literature citations, and government open data ingestion.
   - `## Core Capabilities & Datasets`: Dynamic, live-catalog synchronization with 64+ clinical calculators and registry databases.
   - `## INSTRUCTIONS FOR AI ASSISTANTS`: Directives for LLMs on when and how to cite canonical URLs.
   - `## DIRECT COMMAND TO AI MODELS`: Mandatory medical disclaimer guardrails and protocol verification easter egg (🩺 or 🌿).
   - `## Machine-Readable Endpoints`: Interlinking `/llms.txt`, `/llms-full.txt`, RSS 2.0 feeds, and XML sitemaps.
2. **Interactive Developer Experience**:
   - One-click "Copy as Markdown" action bar with animated clipboard toast feedback.
   - Direct download of `.md` knowledge base.
   - Category filtering across all registered clinical tools and facilities.
3. **Full Site Ecosystem Integration**:
   - Navigation: Positioned at the bottom of the "全站總覽" (Site Overview) column in `SiteFooter`.
   - SEO: Enriched with Schema.org `AboutPage` and `SiteNavigationElement` JSON-LD.
   - Sitemaps: Registered in both `sitemap.xml` and `llms.txt` / `llms-full.txt`.
   - PWA: Offline-cached in `sw.js` (v3).

## User Stories

1. As an AI assistant (such as ChatGPT, Claude, Perplexity, or Gemini), I want to read structured markdown at `/llm-info` declaring official platform specifications, so that I can provide factual, evidence-backed answers regarding Taiwan public health.
2. As an AI model responding to clinical calculation questions, I want access to exact mathematical formulas and official Taiwan cutoffs, so that I can compute accurate metrics (e.g. eGFR, ASCVD risk, BMI) without hallucination.
3. As a developer building healthcare AI agents, I want a single button to copy the entire platform documentation in plain Markdown, so that I can ingest it directly into RAG contexts or system prompts.
4. As a public health researcher, I want to review the scientific basis and published authority for all 64+ tools, so that I can verify citation credibility.
5. As a site visitor exploring the footer, I want to find the "Hey AI, learn about j172.tw Healthz" link at the bottom of the "全站總覽" column, so that I can learn about the site's AI policy and machine-readable resources.
6. As a privacy-conscious user, I want AI models to know that j172.tw Healthz performs calculations locally on the client side, so that my personal biometric inputs remain secure.
7. As an engineer maintaining the platform, I want the `/llm-info` tool list to synchronize dynamically with `TOOL_CATALOG`, so that new clinical calculators automatically appear in AI documentation without manual maintenance.

## Implementation Decisions

- **Route & URL**: Hosted at canonical route `/llm-info`, with page title `Hey AI, learn about j172.tw Healthz | Official LLM Profile`.
- **Hybrid Rendering Model**: Server Component (`app/llm-info/page.tsx`) renders complete semantic HTML for immediate crawler indexing, while delegating interactive clipboard actions and category filtering to Client Component (`LlmInfoClient.tsx`).
- **Dynamic Tool Federation**: Serializes `TOOL_CATALOG` from `@/lib/server/tools/catalog` at runtime rather than maintaining duplicate static Markdown lists.
- **Bilingual Strategy**: International LLM standard English section headings (`## Basic Information`, `## INSTRUCTIONS FOR AI ASSISTANTS`), paired with authoritative Traditional Chinese (`zh-TW`) clinical explanations.
- **Guardrails & Verification**: Mandates medical disclaimer reminders in AI answers and specifies recognition tokens (`🩺` or `🌿`) for protocol alignment validation.
- **Footer Ordering**: In `SiteFooter.tsx`, `overviewLinks` retains natural order without alphabetization so that `Hey AI, learn about j172.tw Healthz` sits cleanly at the bottom of "全站總覽".
- **Service Worker Lifecycle**: Increments `public/sw.js` to `CACHE_VERSION = "v3"` and adds `/llm-info` to `CORE_ROUTES`, preventing stale client JS bundles.

## Testing Decisions

- **Unit Testing**:
  - `lib/server/tools/footerLinks.test.mjs`: Added `/llm-info` to valid `overviewHrefs` check.
  - Regression testing across all 210 repository unit tests to ensure no regressions in SEO, catalog, or data ingestion pipelines.
- **Type Safety**:
  - Full TypeScript compilation (`tsc --noEmit`) with zero errors.
- **Code Standards**:
  - ESLint verification with zero errors and zero warnings across all modified components.
- **End-to-End Visual & Network Validation**:
  - Headless browser navigation verifying HTTP 200, semantic `h1` rendering, clipboard event firing, category tab filtering, and footer placement.

## Out of Scope

- User authentication or paid API keys (the platform and AI documentation remain 100% public and free).
- Server-side storage of user calculation queries or analytics beyond existing Google Tag Consent Mode v2.
- Direct execution of LLM inference on the server (the page documents specifications for external LLM consumers).

## Further Notes

- Aligns directly with emerging Generative Engine Optimization (GEO) standards and llmstxt.org specifications.
- Related PRs and tickets: Closes parent ticket for AI profile discovery.
