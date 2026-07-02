// Virtual navigation (config.nav): group FLAT slugs into tabs + sidebar groups by config, no folders,
// no slug prefixes. Imports app.tsx (JSX) → runs under bun.
import { test, expect } from "bun:test";
import { createDocs } from "../../src/app.tsx";
import { doc } from "../fixtures.ts";

const DOCS = [
  doc("discord", "Discord"),
  doc("slack", "Slack"),
  doc("kiro", "Kiro CLI (Default Agent)"), // long H1 → overridden to "Kiro" in nav
  doc("codex", "Codex"),
  doc("adr/decision-a", "ADR: Decision A"), // a real subfolder → auto-filled group
  doc("adr/decision-b", "ADR: Decision B"),
];
const finder = (slug: string) => DOCS.find((d) => d.slug === slug) ?? null;
const kura = createDocs({
  content: { DOCS, doc: finder as never },
  config: {
    basePath: "",
    deploy: { target: "github-pages", basePath: "/openab" },
    nav: {
      tabs: [
        { title: "Guides", groups: ["platforms", "agents"] },
        { title: "Reference", groups: ["adr"] },
      ],
      groups: {
        platforms: { title: "Platforms", pages: ["discord", "slack"] },
        agents: { title: "Agent backends", pages: [{ slug: "kiro", title: "Kiro" }, "codex"] },
        adr: { title: "Design records" }, // no pages → auto-fill from the adr/ subfolder
      },
    },
  } as never,
});

test("sidebar groups + ordered flat-slug items come from config.nav", () => {
  const guides = kura.sidebarFor(undefined, ["platforms", "agents"]);
  expect(guides.map((g) => g.title)).toEqual(["Platforms", "Agent backends"]);
  expect(guides[0]!.items.map((i) => i.slug)).toEqual(["discord", "slack"]); // FLAT slugs, config order
  expect(guides[1]!.items.map((i) => i.slug)).toEqual(["kiro", "codex"]);
});

test("a { slug, title } override sets the sidebar label; bare slugs keep their H1", () => {
  const agents = kura.sidebarFor(undefined, ["agents"])[0]!;
  expect(agents.items.find((i) => i.slug === "kiro")!.title).toBe("Kiro"); // override, not "Kiro CLI (…)"
  expect(agents.items.find((i) => i.slug === "codex")!.title).toBe("Codex"); // H1
});

test("a group with no pages auto-fills from the docs subfolder of the same name", () => {
  const ref = kura.sidebarFor(undefined, ["adr"])[0]!;
  expect(ref.title).toBe("Design records");
  expect(ref.items.map((i) => i.slug)).toEqual(["adr/decision-a", "adr/decision-b"]);
});

test("the page <title> uses the override too (single source, no injection)", () => {
  const kiro = kura.docRoute.loader({ params: { slug: "kiro" } } as never) as { doc: { title: string; slug: string } };
  expect(kiro.doc.title).toBe("Kiro"); // not the long H1
  expect(kiro.doc.slug).toBe("kiro"); // URL stays flat
});

test("prev/next follow config order and stay within the tab", () => {
  const rendered = kura.docRoute.loader({ params: { slug: "discord" } } as never) as { doc: { next: { slug: string } | null } };
  expect(rendered.doc.next?.slug).toBe("slack"); // discord → slack within Platforms
});
