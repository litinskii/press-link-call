export interface BrowserIdentity {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}

export function isSafariFamily(identity?: BrowserIdentity): boolean {
  if (!identity && typeof navigator === "undefined") return false;

  const browser = identity ?? navigator;
  const userAgent = browser.userAgent;
  const appleMobile = /iPad|iPhone|iPod/.test(userAgent)
    || (browser.platform === "MacIntel" && browser.maxTouchPoints > 1);
  const desktopSafari = /Safari/.test(userAgent) && !/Chrome|Chromium|Android/.test(userAgent);

  return appleMobile || desktopSafari;
}
