"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import styles from "./signin.module.css";

export default function Signin() {
  const [showPassword, setShowPassword] = useState(false);

  const handleSignin = () => {

  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Sign-in</h1>

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

        <div className={styles.rememberRow}>
          <input type="checkbox" id="remember" className={styles.checkbox} />
          <label htmlFor="remember" className={styles.rememberLabel}>
            Remember me
          </label>
        </div>

        <p className={styles.signupText}>
          Don&apos;t have an account?{" "}
          <Link href="/staff/auth/signup" className={styles.signupLink}>
            Signup here
          </Link>
        </p>

        <button className={styles.signinButton} onClick={handleSignin}>Sign in</button>
      </div>
    </div>
  );
}
