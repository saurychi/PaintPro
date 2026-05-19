import type { Browser } from "playwright-core";

// IMPORTANT:
// This import is intentionally kept here so Vercel/Next file tracing includes
// playwright-core's browser metadata in the deployed serverless bundle.
// Without this, production may fail with:
// Cannot find module '/var/task/node_modules/playwright-core/browsers.json'
import "playwright-core/browsers.json";

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
    // AWS_LAMBDA_JS_RUNTIME. Vercel sets AWS_LAMBDA_FUNCTION_NAME but may not
    // set either of those, so the package can treat Vercel as a non-Lambda host.
    // Spoof the env var before importing @sparticuz/chromium so its module-load
    // detection takes the Lambda-compatible path.
    if (process.env.VERCEL && !process.env.AWS_EXECUTION_ENV) {
      process.env.AWS_EXECUTION_ENV = "AWS_Lambda_nodejs20.x";
    }

    const { default: chromium } = await import("@sparticuz/chromium");

    cachedLaunchArgs = {
      args: [
        ...chromium.args,
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-sandbox",
      ],
      executablePath: await chromium.executablePath(),
      headless: true,
    };
  } else {
    cachedLaunchArgs = {
      args: [],
      headless: true,
    };
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

const globalStore = globalThis as unknown as Record<
  typeof GLOBAL_KEY,
  BrowserCache | undefined
>;

const cache: BrowserCache =
  globalStore[GLOBAL_KEY] ??
  (globalStore[GLOBAL_KEY] = {
    browser: null,
    pendingLaunch: null,
  });

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
// launch cost; subsequent callers share the same Chromium process and only pay
// for `browser.newContext()` / `browser.newPage()`.
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

// Back-compat alias for any old call sites. Do not `await browser.close()` on
// this shared browser; close pages/contexts instead.
export async function launchPdfBrowser(): Promise<Browser> {
  return getPdfBrowser();
}

// Force the next getPdfBrowser() call to relaunch instead of handing back
// the cached handle.
export async function invalidatePdfBrowser(): Promise<void> {
  const stale = cache.browser;
  cache.browser = null;

  if (stale) {
    try {
      await stale.close();
    } catch {
      // The browser is already gone.
    }
  }
}

// Pattern matched against caught errors to decide if this is a dead-browser
// case worth retrying.
const BROWSER_CLOSED_RE =
  /(Target page, context or browser has been closed|browser has been closed|disconnected from|browserType\.launch|Executable doesn't exist|Failed to launch|browserType\.launch:)/i;

// Runs `fn` against a healthy PDF browser. If the first attempt fails with a
// closed-browser / failed-launch error, the cached handle is torn down and the
// work runs again on a fresh launch.
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
        attempt += 1;
        await invalidatePdfBrowser();
        continue;
      }

      throw error;
    }
  }
}