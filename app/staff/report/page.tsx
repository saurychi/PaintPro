"use client";

import Link from "next/link";
import styles from "./report.module.css";
import { cn } from "@/lib/utils";
import { ChevronRight, ClipboardList, Wallet } from "lucide-react";

type Tile = {
  title: string;
  subtitle: string;
  href: string;
  icon: React.ElementType;
};

const TILES: Tile[] = [
  {
    title: "Attendance",
    subtitle: "View staff attendance logs and status breakdown",
    href: "/staff/report/attendance",
    icon: ClipboardList,
  },
  {
    title: "Payment",
    subtitle: "View payroll summaries, payslips, and payment status",
    href: "/staff/report/payment",
    icon: Wallet,
  },
];

export default function StaffReportPage() {
  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.titleWrap}>
          <h1 className={styles.title}>Report</h1>
          <div className={styles.subtitle}>Staff report • Backend-ready UI</div>
        </div>
      </div>

      <div className={styles.grid}>
        {TILES.map((t) => {
          const Icon = t.icon;

          return (
            <Link key={t.href} href={t.href} className={styles.tile}>
              <div className={styles.tileLeft}>
                <div className={cn(styles.iconBox)}>
                  <Icon className={styles.icon} />
                </div>

                <div className={styles.tileText}>
                  <div className={styles.tileTitle}>{t.title}</div>
                  <div className={styles.tileSubtitle}>{t.subtitle}</div>
                </div>
              </div>

              <div className={styles.tileRight}>
                <div className={styles.goBtn} aria-hidden="true">
                  <ChevronRight className={styles.goIcon} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
