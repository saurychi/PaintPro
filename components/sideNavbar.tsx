"use client";

import Image from "next/image";
import Link from "next/link";
import styles from "./staffNavbar.module.css";

type SidebarItem = {
  key: string;
  label: string;
  hrefs: string[];
};

const items: SidebarItem[] = [
  { key: "jobs", label: "Jobs", hrefs: ["/dashboard", "/dashboard/jobs"] },
  { key: "staff", label: "Staff", hrefs: ["/staff"] },
  { key: "schedule", label: "Schedule", hrefs: ["/schedule"] },
  { key: "report", label: "Report", hrefs: ["/report"] },
  { key: "inventory", label: "Inventory", hrefs: ["/inventory"] },
  { key: "documents", label: "Documents", hrefs: ["/documents"] },
  { key: "messages", label: "Messages", hrefs: ["/messages"] },
  { key: "settings", label: "Settings", hrefs: ["/settings"] },
];

interface Props {
  activeKey?: string;
}

export default function sideNavbar({ activeKey = "jobs" }: Props) {
  return (
    <div className={styles.shell}>
      <div className={styles.edge} />

      <aside className={styles.sidebar}>
        <div className={styles.topRow}>
          <div className={styles.logoWrapper}>
            <Image
              src="/paint_pro_logo.png"
              alt="PaintPro"
              width={80}
              height={40}
              className={styles.logoImage}
            />
            <span className={styles.logoText}>PAUL JACKMAN</span>
            <span className={styles.logoSubtext}>Painting & Decorating</span>
          </div>

          <button className={styles.collapseButton} type="button">
            &lt;
          </button>
        </div>

        <nav className={styles.nav}>
          {items.map((item) => {
            const isActive = item.key === activeKey;
            return (
              <Link key={item.key} href={item.hrefs[0]} className={styles.link}>
                <div
                  className={
                    isActive
                      ? `${styles.navItem} ${styles.navItemActive}`
                      : styles.navItem
                  }
                >
                  <span className={styles.iconCircle} />
                  <span className={styles.label}>{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}
