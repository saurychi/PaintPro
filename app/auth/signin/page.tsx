"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/firebase/firebase.config";
import styles from "./signin.module.css";
import { collection, getDocs, query, where } from "firebase/firestore";

export default function Signin() {
  const router = useRouter();

  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function isEmail(identity: string) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(identity);
  }

  const handleSignin = async () => {
    setError("");

    if (!identity || !password) {
      setError("Please enter your email and password.");
      return;
    }

    try {
      setLoading(true);
      if (isEmail(identity)) {
        await signInWithEmailAndPassword(auth, identity, password);
      } else {
        const snapshot = await getDocs(query(collection(db, 'users'),where("username", "==", identity)))
        if (snapshot.empty) {
          throw new Error("No user found");
        }
        const userDoc = snapshot.docs[0];
        await signInWithEmailAndPassword(auth, userDoc.data().email, password);
      }

      router.push("/admin/dashboard");
    } catch (err: any) {
      console.error(err);

      if (err.code === "auth/invalid-credential") {
        setError("Invalid email or password.");
      } else if (err.code === "auth/user-not-found") {
        setError("No account exists with that email.");
      } else if (err.code === "auth/wrong-password") {
        setError("Incorrect password.");
      } else {
        setError("Failed to sign in. Try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>

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
          <label className={styles.label}>Client Code</label>
          <input
            type="text"
            className={styles.input}
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
          />
        </div>

        {error && <p style={{ color: "red", fontSize: "13px" }}>{error}</p>}

        <div className={styles.rememberRow}>
          <input type="checkbox" id="remember" className={styles.checkbox} />
          <label htmlFor="remember" className={styles.rememberLabel}>
            Access automatically in this PC
          </label>
        </div>

        <button
          className={styles.signinButton}
          onClick={handleSignin}
          disabled={loading}
        >
          {loading ? "Accessing..." : "Access"}
        </button>
      </div>
    </div>
  );
}
