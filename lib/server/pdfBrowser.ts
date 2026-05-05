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

export async function launchPdfBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const launch = await resolveLaunchArgs();
  return chromium.launch(launch);
}
