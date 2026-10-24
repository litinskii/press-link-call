import { describe, expect, it } from "vitest";
import html from "../../index.html?raw";
import headers from "../../public/_headers?raw";
import robots from "../../public/robots.txt?raw";
import sitemap from "../../public/sitemap.xml?raw";

describe("public search metadata", () => {
  it("describes one canonical, shareable home page", () => {
    expect(html).toContain('<meta name="description"');
    expect(html).toContain('<link rel="canonical" href="https://press-link-call.w-siteee.workers.dev/"');
    expect(html).toContain('<meta property="og:image" content="https://press-link-call.w-siteee.workers.dev/og-image.png"');
    expect(html).toContain('itemtype="https://schema.org/WebSite"');
  });

  it("publishes discovery files while keeping room pages noindex", () => {
    expect(robots).toContain("Sitemap: https://press-link-call.w-siteee.workers.dev/sitemap.xml");
    expect(sitemap).toContain("<loc>https://press-link-call.w-siteee.workers.dev/</loc>");
    expect(headers).toMatch(/\/r\/\*[\s\S]*X-Robots-Tag: noindex, nofollow, noarchive/);
  });
});
