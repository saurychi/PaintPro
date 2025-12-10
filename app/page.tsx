"use client";

import Image from "next/image";
import Link from "next/link";
import styles from "./welcome.module.css";

export default function Welcome() {
  return (
    <div className={styles.hero}>
      <div className={styles.overlay} />

      <div className={styles.content}>
        <div className={styles.logoRow}>
          <Image
            src="/paint_pro_logo.png"
            alt="PaintPro logo icon"
            width={120}
            height={120}
            className={styles.logoIcon}
            priority
          />
          <span className={styles.logoText}>PaintPro</span>
        </div>

        <p className={styles.tagline}>
          Your painting project is always just a click away! Track your jobs,
          view quotations and invoices, and chat directly with the manager while
          staying updated on your crew&apos;s progress, all in one easy to use portal.
          Stay connected with the team, enjoy clear communication, and experience
          a smoother, stress free painting journey from start to finish.
        </p>

        <Link href="/role_selection">
          <button className={styles.startButton}>Start</button>
        </Link>
      </div>
    </div>
  );
}
