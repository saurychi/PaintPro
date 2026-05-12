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
    // @sparticuz/chromium detects Lambda by sniffing AWS_EXECUTION_ENV /
    // AWS_LAMBDA_JS_RUNTIME (see node_modules/@sparticuz/chromium/build/
    // helper.js). Vercel sets AWS_LAMBDA_FUNCTION_NAME but NOT either of
    // those, so the package treats us as a non-Lambda host: it skips
    // `setupLambdaEnvironment()` and never inflates `al2023.tar.br`. The
    // chromium binary then crashes with `libnss3.so: cannot open shared
    // object file` because its runtime libs never made it onto disk.
    // Spoof the env var before the import so the module-load-time
    // detection (and the later executablePath() lib extraction) both
    // take the AL2023 path.
    if (process.env.VERCEL && !process.env.AWS_EXECUTION_ENV) {
      process.env.AWS_EXECUTION_ENV = "AWS_Lambda_nodejs20.x";
    }

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

// Force the next getPdfBrowser() call to relaunch instead of handing back
// the cached handle. Used by withFreshPdfBrowser when the underlying
// Chromium process is dead but the cache still thinks it's healthy.
export async function invalidatePdfBrowser(): Promise<void> {
  const stale = cache.browser;
  cache.browser = null;
  if (stale) {
    try {
      await stale.close();
    } catch {
      // The browser is already gone — that's why we're invalidating.
    }
  }
}

// Pattern matched against caught errors to decide "is this a dead-browser
// case worth retrying?". Playwright surfaces the same Chromium tear-down
// under a few different wordings depending on whether newContext, newPage,
// or an in-flight call was the one that landed on the closed handle.
const BROWSER_CLOSED_RE =
  /(Target page, context or browser has been closed|browser has been closed|disconnected from|browserType\.launch)/i;

// Runs `fn` against a healthy PDF browser. If the first attempt fails with
// a closed-browser error, the cached handle is torn down and the work runs
// again on a fresh launch. Used by the PDF / signature routes whose cached
// browser can otherwise zombie-reap between Vercel function freezes.
export async function withFreshPdfBrowser<T>(
  fn: (browser: Browser) => Promise<T>,
): Promise<T> {
  let attempt = 0;
  while (true) {
    const browser = await getPdfBrowser();
    try {
      return await fn(browser);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      if (attempt === 0 && BROWSER_CLOSED_RE.test(message)) {
        attempt++;
        await invalidatePdfBrowser();
        continue;
      }
      throw error;
    }
  }
}
