// OG image route factory for kura docs. Designed to be used as a June resource route:
//
//   // app/og/[[...slug]]/route.ts
//   import { createOgRoute } from "@kurajs/docs/og";
//   import kuraConfig from "../../kura.config";
//   import { DOCS } from "../../_content";
//   export default createOgRoute({ DOCS }, kuraConfig);
//
// The correct ImageResponse backend is selected at BUILD TIME via @junejs/og export conditions:
//   workerd (Cloudflare) → workers-og, edge-light (Vercel) → @vercel/og, default → satori+resvg-js
import { createElement } from "react";
import { ImageResponse, loadGoogleFont, hasCJK, OG_HEADERS } from "@junejs/og";
import type { OgFont } from "@junejs/og";
import { resolveOgSlug, type DocLike } from "./nav.ts";
import type { KuraConfig } from "./config.ts";

const W = 1200;
const H = 630;

/**
 * Load Inter (+ Noto Sans TC when the text has CJK) at the weights kuraOgCard actually renders:
 * 600 for the section tag, 700 for the title and brand name. The shared loadDefaultFonts() only
 * subsets weight 600, so 700 text would fall back to SemiBold — visibly lighter than intended.
 * Each weight is a tiny per-text subset and is cached, so loading both is cheap.
 */
async function loadCardFonts(text: string): Promise<OgFont[]> {
  const families = ["Inter", ...(hasCJK(text) ? ["Noto Sans TC"] : [])];
  const weights = [600, 700] as const;
  return Promise.all(
    families.flatMap((name) =>
      weights.map(async (weight) => ({
        name,
        data: await loadGoogleFont(name, weight, text),
        weight,
        style: "normal" as const,
      })),
    ),
  );
}

// Brand domain shown bottom-right. Kept as a constant (not an inline literal) so the font-subset
// computation in createOgRoute can include its glyphs — otherwise '.', 'b', 'l' render as tofu.
const BRAND_DOMAIN = "kura.build";

export interface KuraOgCardOptions {
  title: string;
  section?: string;
  siteName?: string;
}

/** Kura-branded OG card: indigo top stripe, large title, section tag, brand at bottom. */
export function kuraOgCard({ title, section, siteName = "Kura" }: KuraOgCardOptions) {
  const fontSize = title.length > 50 ? "52px" : title.length > 30 ? "62px" : "72px";
  return createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "0",
        background: "#ffffff",
        fontFamily: "Inter, 'Noto Sans TC'",
      },
    },
    // Indigo accent bar
    createElement("div", {
      style: { display: "flex", height: "8px", background: "#4f46e5", flexShrink: 0 },
    }),
    // Content area
    createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flex: 1,
          padding: "56px 72px 60px",
        },
      },
      // Section tag
      createElement(
        "div",
        { style: { display: "flex" } },
        section
          ? createElement("div", {
              style: {
                display: "flex",
                fontSize: "24px",
                fontWeight: 600,
                color: "#4f46e5",
                letterSpacing: "0.04em",
              },
              // Uppercase in JS rather than via CSS text-transform: the font is subset to only the
              // glyphs in the source text, so a CSS transform would request glyphs (the uppercased
              // letters) that were never downloaded → tofu. Render exactly what we subset.
            }, section.toUpperCase())
          : createElement("div", {
              style: { display: "flex", fontSize: "24px", color: "#9ca3af" },
            }, siteName),
      ),
      // Title
      createElement("div", {
        style: {
          display: "flex",
          fontSize,
          fontWeight: 700,
          lineHeight: 1.15,
          letterSpacing: "-0.025em",
          color: "#111111",
          maxWidth: "960px",
        },
      }, title),
      // Bottom: brand
      createElement(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
        createElement(
          "div",
          { style: { display: "flex", alignItems: "center" } },
          // Kura logomark (indigo rounded square)
          createElement("div", {
            style: {
              display: "flex",
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              background: "#4f46e5",
              marginRight: "14px",
            },
          }),
          createElement("div", {
            style: { display: "flex", fontSize: "30px", fontWeight: 700, color: "#111111" },
          }, siteName),
        ),
        section
          ? createElement("div", {
              style: { display: "flex", fontSize: "22px", color: "#9ca3af" },
            }, BRAND_DOMAIN)
          : null,
      ),
    ),
  );
}

/**
 * Create a June resource route handler that serves per-page OG images.
 * Mount it at `app/og/[[...slug]]/route.ts` (a catch-all, so nested slugs like
 * `/og/getting-started/sdk.png` resolve — not just single-segment `/og/sdk.png`).
 */
export function createOgRoute<T extends DocLike>(
  content: { DOCS: readonly T[] },
  config?: Pick<KuraConfig, "site">,
): (request: Request, ctx: { params: Record<string, string | undefined> }) => Promise<Response> {
  // Record<string, string | undefined>: the route mounts at the OPTIONAL catch-all og/[[...slug]], so
  // June calls with params.slug missing for /og itself — resolveOgSlug tolerates undefined.
  const siteName = config?.site?.name ?? "Kura";
  // Built once, not per request: lets resolveOgSlug prefer a real doc literally named "index".
  const docSlugs = new Set(content.DOCS.map((d) => d.slug));

  return async (_req, ctx) => {
    const slug = resolveOgSlug(docSlugs, ctx.params.slug);
    const doc = content.DOCS.find((d) => d.slug === slug);

    const title = doc ? String(doc.data.title ?? slug) : siteName;
    const section = doc ? String(doc.data.section ?? "") : "";
    // The font is subset to exactly these glyphs, so this MUST include every character the card
    // rasterizes: the title, the section tag uppercased (kuraOgCard uppercases it), the site name,
    // and the brand domain. Anything rendered but omitted here shows up as a tofu box.
    const allText = `${title} ${section.toUpperCase()} ${siteName} ${BRAND_DOMAIN}`;

    const fonts = await loadCardFonts(allText);

    return new ImageResponse(
      kuraOgCard({ title, section: section || undefined, siteName }) as never,
      { width: W, height: H, fonts, headers: OG_HEADERS },
    );
  };
}
