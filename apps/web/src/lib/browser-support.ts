import { isSupported as canPublish } from "@moq/publish/support";
import { isSupported as canWatch } from "@moq/watch/support";
import { isSafariFamily } from "./browser-platform";
import { evaluateBrowserSupport, type BrowserSupportResult } from "./browser-support-evaluation";

export async function checkBrowserSupport(): Promise<BrowserSupportResult> {
  if (!window.isSecureContext) {
    return { supported: false, message: "Camera and microphone access requires a secure HTTPS connection." };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { supported: false, message: "Camera and microphone access is not available in this browser." };
  }

  try {
    const [publish, watch] = await Promise.all([canPublish(), canWatch()]);
    const support = evaluateBrowserSupport(publish, watch);
    if (!support.supported || !isSafariFamily()) return support;

    const safariWarning = "Safari support is experimental. The call may disconnect because WebTransport support is still being stabilized.";
    return {
      ...support,
      warning: support.warning ? `${support.warning} ${safariWarning}` : safariWarning,
    };
  } catch {
    return { supported: false, message: "Could not verify media support in this browser. Try the latest Chrome, Edge, or Safari." };
  }
}
