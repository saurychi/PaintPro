"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import styles from "./signup.module.css";

export default function Signup() {
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);

  return (
    <div className={styles.container}>
      {/* Title */}
      <h1 className={styles.title}>Sign-up</h1>

      {/* Logo */}
      <div className={styles.logoRow}>
        <Image
          src="/paint_pro_logo.png"
          alt="PaintPro logo"
          width={120}
          height={120}
          priority
        />
        <span className={styles.logoText}>PaintPro</span>
      </div>

      <div className={styles.form}>
        <div className={styles.inputGroup}>
          <label className={styles.label}>Username</label>
          <input type="text" className={styles.input} />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label}>Password</label>

          <div className={styles.passwordWrapper}>
            <input
              type={showPassword ? "text" : "password"}
              className={styles.input}
            />
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label}>Re-type Password</label>

          <div className={styles.passwordWrapper}>
            <input
              type={showPassword2 ? "text" : "password"}
              className={styles.input}
            />
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setShowPassword2(!showPassword2)}
            >
              {showPassword2 ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <p className={styles.loginText}>
          Already have an account?{" "}
          <Link href="/staff/auth/signin" className={styles.loginLink}>
            Sign in here
          </Link>
        </p>

        <button className={styles.signupButton}>Sign up</button>
      </div>
    </div>
  );
}
