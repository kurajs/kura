// OG image route factory for kura docs. Designed to be used as a June resource route:
//
//   // app/og/[slug]/route.ts
//   import { createOgRoute } from "@kurajs/docs/og";
//   import kuraConfig from "../../kura.config";
//   import { DOCS } from "../../_content";
//   export default createOgRoute({ DOCS }, kuraConfig);
//
// The correct ImageResponse backend is selected at BUILD TIME via @junejs/og export conditions:
//   workerd (Cloudflare) → workers-og, edge-light (Vercel) → @vercel/og, default → satori+resvg-js
import { createElement } from "react";
import { ImageResponse, loadDefaultFonts, OG_HEADERS } from "@junejs/og";
import type { DocLike } from "./nav";
import type { KuraConfig } from "./config";

const W = 1200;
const H = 630;

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
                textTransform: "uppercase",
              },
            }, section)
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
            }, "kura.build")
          : null,
      ),
    ),
  );
}

/**
 * Create a June resource route handler that serves per-page OG images.
 * Mount it at `app/og/[slug]/route.ts` and it will handle `/og/<slug>.png`.
 */
export function createOgRoute<T extends DocLike>(
  content: { DOCS: readonly T[] },
  config?: Pick<KuraConfig, "site">,
): (request: Request, ctx: { params: Record<string, string> }) => Promise<Response> {
  const siteName = config?.site?.name ?? "Kura";

  return async (_req, ctx) => {
    const slug = String(ctx.params.slug ?? "").replace(/\.png$/, "");
    const doc = content.DOCS.find((d) => d.slug === slug);

    const title = doc ? String(doc.data.title ?? slug) : siteName;
    const section = doc ? String(doc.data.section ?? "") : "";
    const allText = `${title}${section}${siteName}`;

    const fonts = await loadDefaultFonts(allText);

    return new ImageResponse(
      kuraOgCard({ title, section: section || undefined, siteName }) as never,
      { width: W, height: H, fonts, headers: OG_HEADERS },
    );
  };
}
