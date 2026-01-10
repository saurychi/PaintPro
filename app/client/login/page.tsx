"use client";

import Image from "next/image";
import styles from "./login.module.css";
import { useState } from "react";

export default function Login() {
  const [show, setShow] = useState(false);

  return (
    <div className={styles.hero}>
      <div className={styles.content}>
        <div className={styles.logoRow}>
          <Image
            src="/paint_pro_logo.png"
            alt="PaintPro logo icon"
            width={110}
            height={110}
            className={styles.logoIcon}
            priority
          />
          <span className={styles.logoText}>PaintPro</span>
        </div>

        <div className={styles.form}>
          <div className={styles.labelRow}>
            <span className={styles.label}>Client Code</span>

            <button
              type="button"
              className={styles.hideBtn}
              onClick={() => setShow((v) => !v)}
            >
              <span className={styles.eye}>👁</span>
              <span>{show ? "Show" : "Hide"}</span>
            </button>
          </div>

          <input
            type={show ? "text" : "password"}
            placeholder="Enter client code"
            className={styles.input}
          />

          <label className={styles.checkboxRow}>
            <input type="checkbox" defaultChecked />
            <span>Access automatically in this PC</span>
          </label>

          <button className={styles.accessButton}>Access</button>
        </div>
      </div>
    </div>
  );
}
