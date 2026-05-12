import type { NextConfig } from "next";

// Routes that render PDFs via Playwright + @sparticuz/chromium. Vercel's
// file tracer doesn't pick up the chromium binary on its own (it's loaded
// via @sparticuz/chromium's executablePath() at runtime, after the trace
// has already finished), so we tell Next.js to bundle the whole package
// alongside each of these route handlers.
const PDF_ROUTES = [
  "/api/quotation/pdf",
  "/api/quotation/save-generated",
  "/api/invoice/pdf",
  "/api/cancellation-agreement/pdf",
  "/api/client/documents/quotation-signature",
  "/api/client/documents/invoice-signature",
  "/api/client/documents/cancellation-agreement-signature",
];

const pdfTracingIncludes = PDF_ROUTES.reduce<Record<string, string[]>>(
  (acc, route) => {
    acc[route] = ["./node_modules/@sparticuz/chromium/**"];
    return acc;
  },
  {},
);

const nextConfig: NextConfig = {
  // @sparticuz/chromium and playwright-core must NOT be webpacked into the
  // serverless bundle. Webpack mangles their dynamic requires (chromium
  // dlopens its native deps via paths it computes at runtime), which on
  // Vercel surfaces as the libnss3.so / "missing shared library" crash
  // you see when calling /api/quotation/pdf.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  outputFileTracingIncludes: pdfTracingIncludes,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  devIndicators: false,
  allowedDevOrigins: [
    "http://10.0.2.2:3000",
    "http://10.0.2.2",
  ],
};

export default nextConfig;
