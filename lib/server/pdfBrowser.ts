import type { Browser } from "playwright-core";

// Vercel's serverless functions don't bundle a Chromium binary, and
// @sparticuz/chromium ships a Lambda-compatible build with the right glibc /
// missing system libs already accounted for. Locally we fall back to whatever
// chromium `playwright-core` finds in the standard ~/.cache/ms-playwright
// location (installed once via the `playwright` dev dependency / `npx
// playwright install`).
function isServerless() {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.NETLIFY ||
      process.env.LAMBDA_TASK_ROOT,
  );
}

let cachedLaunchArgs: {
  args: string[];
  executablePath?: string;
  headless: boolean;
} | null = null;

async function resolveLaunchArgs() {
  if (cachedLaunchArgs) return cachedLaunchArgs;

  if (isServerless()) {
    const { default: chromium } = await import("@sparticuz/chromium");
    cachedLaunchArgs = {
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    };
  } else {
    cachedLaunchArgs = { args: [], headless: true };
  }

  return cachedLaunchArgs;
}

// Hot-module-reload safe singleton: stash the browser on globalThis so
// dev-mode HMR doesn't leak a new browser per code change. In production
// this is a single persistent reference for the life of the Node process.
type BrowserCache = {
  browser: Browser | null;
  pendingLaunch: Promise<Browser> | null;
};

const GLOBAL_KEY = "__paintpro_pdf_browser__" as const;
const cache: BrowserCache =
  ((globalThis as unknown) as Record<typeof GLOBAL_KEY, BrowserCache>)[
    GLOBAL_KEY
  ] ??
  ((((globalThis as unknown) as Record<typeof GLOBAL_KEY, BrowserCache>)[
    GLOBAL_KEY
  ] = {
    browser: null,
    pendingLaunch: null,
  }),
  ((globalThis as unknown) as Record<typeof GLOBAL_KEY, BrowserCache>)[
    GLOBAL_KEY
  ]);

async function launchFresh(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const launch = await resolveLaunchArgs();
  const browser = await chromium.launch(launch);
  // Drop the singleton on disconnect so the next caller relaunches instead
  // of attempting to use a dead handle. Playwright fires 'disconnected'
  // when the underlying Chromium crashes or the connection drops.
  browser.on("disconnected", () => {
    if (cache.browser === browser) {
      cache.browser = null;
    }
  });
  return browser;
}

// Returns a reusable, long-lived Browser. The first caller pays the cold
// launch cost (~500-2000ms); subsequent callers share the same Chromium
// process and only pay for `browser.newContext()` / `browser.newPage()`
// (~50-150ms).
//
// Concurrent first calls collapse onto a single in-flight launch via
// `pendingLaunch` so a burst of requests doesn't spawn N browsers.
export async function getPdfBrowser(): Promise<Browser> {
  if (cache.browser && cache.browser.isConnected()) {
    return cache.browser;
  }
  if (cache.pendingLaunch) {
    return cache.pendingLaunch;
  }

  cache.pendingLaunch = (async () => {
    try {
      const browser = await launchFresh();
      cache.browser = browser;
      return browser;
    } finally {
      cache.pendingLaunch = null;
    }
  })();

  return cache.pendingLaunch;
}

// Back-compat alias for any old call sites — they get the cached browser
// now too. Don't `await browser.close()` on this; close pages/contexts
// instead.
export async function launchPdfBrowser(): Promise<Browser> {
  return getPdfBrowser();
}
