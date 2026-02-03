"use client";

import { useMemo } from "react";
import Link from "next/link";
import styles from "./report.module.css";

import { ChevronRight } from "lucide-react";

export default function AdminReportPage() {
  // Backend-ready placeholders: swap these with real fetched values later
  const kpi = useMemo(() => {
    return {
      rangeLabel: "2023-present",
      totalJobs: 128,
      totalRevenue: 245_300,
      totalCost: 176_400,
      netProfit: 68_900,
    };
  }, []);

  const profitMargin = useMemo(() => {
    if (kpi.totalRevenue <= 0) return 0;
    return Math.round((kpi.netProfit / kpi.totalRevenue) * 100);
  }, [kpi]);

  const currency = (n: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.titleWrap}>
          <h1 className={styles.title}>Report</h1>
          <div className={styles.subtitle}>Insights and summaries • {kpi.rangeLabel}</div>
        </div>
      </div>

      <div className={styles.grid}>
        {/* LEFT: KPI / Overview card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <div className={styles.cardTitle}>Report Overview</div>
              <div className={styles.cardSub}>{kpi.rangeLabel}</div>
            </div>

            <Link className={styles.primaryBtn} href="/admin/report/report-overview">
              Open Overview
              <ChevronRight className={styles.btnIcon} />
            </Link>
          </div>

          <div className={styles.kpiGrid}>
            <div className={styles.kpiBox}>
              <div className={styles.kpiLabel}>Total Jobs</div>
              <div className={styles.kpiValue}>{kpi.totalJobs}</div>
            </div>

            <div className={styles.kpiBox}>
              <div className={styles.kpiLabel}>Total Revenue</div>
              <div className={styles.kpiValue}>{currency(kpi.totalRevenue)}</div>
            </div>

            <div className={styles.kpiBox}>
              <div className={styles.kpiLabel}>Total Cost</div>
              <div className={styles.kpiValue}>{currency(kpi.totalCost)}</div>
            </div>

            <div className={styles.kpiBox}>
              <div className={styles.kpiLabel}>Net Profit</div>
              <div className={styles.kpiValue}>{currency(kpi.netProfit)}</div>
            </div>

            <div className={styles.kpiBoxWide}>
              <div className={styles.kpiLabel}>Profit Margin</div>
              <div className={styles.kpiValue}>{profitMargin}%</div>
              <div className={styles.kpiHint}>
                Placeholder KPI. Replace with real values from backend later.
              </div>
            </div>
          </div>

          <div className={styles.quickActions}>
            <Link className={styles.secondaryBtn} href="/admin/report/report-list">
              View Reports List
              <ChevronRight className={styles.btnIcon} />
            </Link>

            <Link className={styles.secondaryBtn} href="/admin/report/report-overview">
              View Dashboard Charts
              <ChevronRight className={styles.btnIcon} />
            </Link>
          </div>
        </section>

        {/* RIGHT: Manual Reports card */}
        <section className={styles.cardRight}>
          <div className={styles.cardHeader}>
            <div>
              <div className={styles.cardTitle}>Manual Reports</div>
              <div className={styles.cardSub}>Generate or open report modules</div>
            </div>
          </div>

          <div className={styles.actionList}>
            <Link className={styles.actionBtn} href="/admin/report/report-list">
              <span>Report List</span>
              <span className={styles.actionIconWrap}>
                <ChevronRight className={styles.actionIcon} />
              </span>
            </Link>

            <Link className={styles.actionBtn} href="/admin/report/report-overview">
              <span>Report Overview</span>
              <span className={styles.actionIconWrap}>
                <ChevronRight className={styles.actionIcon} />
              </span>
            </Link>
          </div>

          <div className={styles.noteBox}>
            <div className={styles.noteTitle}>Backend-ready note</div>
            <div className={styles.noteText}>
              This page uses placeholder KPI data. When your API is ready, replace the hardcoded
              values with a fetch call and update the KPIs.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
