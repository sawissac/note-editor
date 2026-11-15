import { execSync } from "node:child_process";
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type HtmlTagDescriptor, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const APP_NAME = "Bento";
const APP_DESCRIPTION =
  "Write Markdown notes and edit Word, Excel, PDF and CSV files right in your browser. Kanban, calendar, SQL and more. Free, offline, no account.";

/** Date the site content last changed (last commit), never "now" — a build
 * date would mark the sitemap as changed on every deploy. */
function lastModified(): string | undefined {
  try {
    return execSync("git log -1 --format=%cI", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
      .slice(0, 10) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Offline support: a Workbox service worker precaches the whole build (app
 * shell, every lazy editor chunk, Monaco workers, SQLite + PDFium wasm), so
 * any editor opens offline even if it was never visited online.
 *
 * - Manifest stays hand-written in public/manifest.webmanifest.
 * - registerType "prompt" with no UI: a new version installs in the
 *   background and takes over on the next launch (all tabs closed), so an
 *   open editor is never reloaded under the user mid-edit.
 * - Third-party assets (Google Fonts, PDF stamp manifest) are cached at
 *   runtime the first time they load online.
 */
function bentoPwa(): Plugin[] {
  return VitePWA({
    registerType: "prompt",
    injectRegister: "script-defer",
    manifest: false,
    includeAssets: ["favicon.ico", "icon.svg", "apple-touch-icon.png", "manifest.webmanifest"],
    workbox: {
      globPatterns: ["**/*.{js,mjs,css,html,wasm,svg,png,ico,woff,woff2,ttf,json,webmanifest}"],
      // Monaco's TS worker and PDFium wasm are several MB each.
      maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
      navigateFallback: "/index.html",
      navigateFallbackDenylist: [/^\/(robots\.txt|sitemap\.xml)$/],
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        {
          urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com",
          handler: "StaleWhileRevalidate",
          options: { cacheName: "google-fonts-css" },
        },
        {
          urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com",
          handler: "CacheFirst",
          options: {
            cacheName: "google-fonts-files",
            expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          urlPattern: ({ url }) => url.origin === "https://cdn.jsdelivr.net",
          handler: "CacheFirst",
          options: {
            cacheName: "cdn-assets",
            expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
      ],
    },
  });
}

/**
 * SEO for the SPA shell: absolute canonical / og:url / og:image, JSON-LD,
 * noindex on non-production deploys, and robots.txt + sitemap.xml at build.
 *
 * Production domain comes from SITE_URL (env or .env file), falling back to
 * Vercel's VERCEL_PROJECT_PRODUCTION_URL. Without one, absolute-URL tags and
 * the sitemap are skipped — link previews need absolute image URLs.
 */
function bentoSeo(siteUrl: string | undefined, indexable: boolean): Plugin {
  const abs = (p: string) => (siteUrl ? new URL(p, siteUrl).href : p);
  const meta = (attrs: Record<string, string>): HtmlTagDescriptor => ({
    tag: "meta",
    attrs,
    injectTo: "head",
  });

  return {
    name: "bento-seo",
    transformIndexHtml() {
      const ogImage = abs("/og-image.png");
      const tags: HtmlTagDescriptor[] = [
        meta({ property: "og:image", content: ogImage }),
        meta({ name: "twitter:image", content: ogImage }),
      ];
      if (siteUrl) {
        tags.push(
          { tag: "link", attrs: { rel: "canonical", href: abs("/") }, injectTo: "head" },
          meta({ property: "og:url", content: abs("/") }),
        );
      }
      if (!indexable) tags.push(meta({ name: "robots", content: "noindex, nofollow" }));

      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: APP_NAME,
        description: APP_DESCRIPTION,
        ...(siteUrl ? { url: abs("/") } : {}),
        image: ogImage,
        applicationCategory: "ProductivityApplication",
        operatingSystem: "Any (web browser)",
        browserRequirements: "Requires JavaScript and IndexedDB",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        featureList: [
          "Markdown editor",
          "Word (.docx) editor",
          "Excel (.xlsx) editor",
          "PDF editor and viewer",
          "CSV table viewer",
          "Kanban boards and calendars",
          "SQL on in-browser SQLite",
          "Regex tester, diff, JSON / YAML / TOML tools",
          "Offline, local-first storage",
        ],
      };
      tags.push({
        tag: "script",
        attrs: { type: "application/ld+json" },
        // Escape "<" so content can never close the script tag early.
        children: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        injectTo: "head",
      });
      return tags;
    },
    generateBundle() {
      // Never Disallow here: a noindex page must stay crawlable for the
      // noindex to be seen, and icons / og-image must stay fetchable.
      const robots = ["User-agent: *", "Allow: /"];
      if (siteUrl && indexable) robots.push("", `Sitemap: ${abs("/sitemap.xml")}`);
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots.join("\n") + "\n" });

      if (siteUrl && indexable) {
        const lastmod = lastModified();
        const sitemap = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          "  <url>",
          `    <loc>${abs("/")}</loc>`,
          ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
          "  </url>",
          "</urlset>",
          "",
        ].join("\n");
        this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemap });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const rawUrl =
    env.SITE_URL ||
    (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  const siteUrl = rawUrl ? rawUrl.replace(/\/+$/, "") + "/" : undefined;
  // Preview / dev deployments on Vercel get noindex; SEO_NOINDEX=1 forces it.
  const indexable =
    env.SEO_NOINDEX !== "1" && (!env.VERCEL_ENV || env.VERCEL_ENV === "production");

  return {
    plugins: [react(), tailwindcss(), bentoSeo(siteUrl, indexable), bentoPwa()],
    resolve: {
      alias: { "@": path.resolve(import.meta.dirname, "src") },
    },
    optimizeDeps: {
      // The schema builder is lazy-loaded, so without this Vite finds these
      // deps mid-session, re-optimizes, and the JSON view's shiki chunks 504.
      include: [
        "@pierre/diffs",
        "@pierre/diffs/react",
        "@dnd-kit/core",
        "@dnd-kit/sortable",
        "@dnd-kit/utilities",
        "next-themes",
        // Lazy-loaded editors (Monaco for .txt / .mermaid, Mermaid renderer).
        "monaco-editor",
        "@monaco-editor/react",
        "mermaid",
        // Developer file types (lazy panes).
        "yaml",
        "smol-toml",
        "sql.js",
        "@eslint-community/regexpp",
        "regexp-tree",
      ],
    },
  };
});
