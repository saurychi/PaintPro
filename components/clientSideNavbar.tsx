"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./css/staffNavbar.module.css";

type SidebarItem = {
  key: string;
  label: string;
  href: string;
};

const items: SidebarItem[] = [
  { key: "schedule", label: "Schedule", href: "/client/schedule" },
  { key: "documents", label: "Documents", href: "/client/documents" },
  { key: "messages", label: "Messages", href: "/client/messages" },
  { key: "report", label: "Report", href: "/client/report" },
  { key: "settings", label: "Settings", href: "/client/settings" },
];

export default function ClientSideNavbar() {
  const pathname = usePathname();

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
            <span className={styles.logoSubtext}>Client Portal</span>
          </div>

          <button className={styles.collapseButton} type="button">
            &lt;
          </button>
        </div>

        <nav className={styles.nav}>
          {items.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link key={item.key} href={item.href} className={styles.link}>
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
