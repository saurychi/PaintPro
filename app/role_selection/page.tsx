"use client";

import Image from "next/image";
import Link from "next/link";
import styles from "./role_selection.module.css";

export default function RoleSelection() {
  return (
    <div className={styles.container}>

      <div className={styles.imageWrapper}>
        <Image
          src="/role_selection_bg.jpg"
          alt="Room interior"
          fill
          className={styles.image}
          priority
        />
      </div>

      <div className={styles.content}>
        <h1 className={styles.title}>What role you are in our system?</h1>

        <div className={styles.buttons}>
          <Link href="/client/login">
            <button className={styles.roleButton}>Client</button>
          </Link>
          <Link href="/auth/signin">
            <button className={styles.roleButton}>Staff</button>
          </Link>
        </div>
      </div>
    </div>
  );
}
