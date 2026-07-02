// Footer deploy-root links: llms.txt lives at the deploy ROOT (not under the docs basePath or a
// locale), so it needs the deploy prefix; MCP is a server route, so it's hidden on static builds.
import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DocsLayoutShell } from "../../src/ui.tsx";

const shell = (props: Record<string, unknown>) =>
  renderToStaticMarkup(<DocsLayoutShell navTabs={[]} {...props}>x</DocsLayoutShell>);

test("static + deploy subpath: llms.txt is deploy-prefixed; MCP is hidden (no server route)", () => {
  const html = shell({ deployPrefix: "/openab", searchStatic: true });
  expect(html).toContain('href="/openab/llms.txt"');
  expect(html).not.toContain(">MCP</a>");
});

test("server target: MCP shown; both deploy-prefixed", () => {
  const html = shell({ deployPrefix: "/x", searchStatic: false });
  expect(html).toContain('href="/x/llms.txt"');
  expect(html).toContain('href="/x/mcp"');
});

test("no deploy subpath: bare root links", () => {
  const html = shell({ deployPrefix: "", searchStatic: false });
  expect(html).toContain('href="/llms.txt"');
  expect(html).toContain('href="/mcp"');
});
