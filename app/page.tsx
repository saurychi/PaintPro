"use client";

import Image from "next/image";
import Link from "next/link";

export default function Welcome() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white dark:bg-gray-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,192,101,0.08),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(0,192,101,0.06),transparent_28%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(0,192,101,0.06),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(0,192,101,0.04),transparent_28%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-10">
        <div className="grid w-full max-w-6xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col justify-center px-8 py-10 sm:px-12 sm:py-12">
            <div className="mb-8 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:h-20 sm:w-20">
                <Image
                  src="/paint_pro_logo.png"
                  alt="PaintPro logo icon"
                  width={56}
                  height={56}
                  className="h-12 w-12 object-contain sm:h-14 sm:w-14"
                  priority
                />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#00c065]">
                  Welcome
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                  PaintPro
                </h1>
              </div>
            </div>

            <div className="mb-8 max-w-2xl space-y-4">
              <h2 className="text-2xl font-semibold leading-tight text-gray-900 dark:text-white sm:text-[30px]">
                Keep your painting project clear, simple, and easy to follow
              </h2>

              <p className="text-sm leading-7 text-gray-600 dark:text-gray-400 sm:text-[15px]">
                Your painting project is always just a click away. Track your
                jobs, view quotations and invoices, and chat directly with the
                manager while staying updated on your crew&apos;s progress, all
                in one easy-to-use portal.
              </p>

              <p className="text-sm leading-7 text-gray-600 dark:text-gray-400 sm:text-[15px]">
                Stay connected with the team, enjoy clear communication, and
                experience a smoother, stress-free painting journey from start
                to finish.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/auth/signin"
                className="inline-flex items-center justify-center rounded-lg bg-[#00c065] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#00a054] active:scale-[0.98]"
              >
                Start
              </Link>

              <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                Client portal access
              </div>
            </div>
          </div>

          <div className="relative hidden min-h-[520px] border-l border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50 lg:block">
            <div className="absolute inset-0 p-8">
              <div className="flex h-full flex-col justify-between rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div>
                  <div className="mb-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#00c065]">
                      Project Overview
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
                      Smooth client experience
                    </h3>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/60">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                        Track progress
                      </p>
                      <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                        View project updates and stay informed on ongoing work.
                      </p>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/60">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                        Easy access
                      </p>
                      <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                        Open quotations, invoices, and project details anytime.
                      </p>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/60">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                        Clear communication
                      </p>
                      <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                        Stay in touch with the manager and keep everything in one place.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
