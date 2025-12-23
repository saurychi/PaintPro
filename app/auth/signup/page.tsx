"use client";

import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/firebase/firebase.config";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./signup.module.css";
import { doc, setDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";

export default function Signup() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);

  const handleSignup = async () => {
    setError("");

    if (!username || !email || !password || !password2) {
      setError("Please fill in all fields.");
      return;
    }

    if (password !== password2) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, {
        displayName: username,
      });
      const role = "client";
      await setDoc(doc(db, "users", user.uid), { username, email, createdAt: new Date(), role });
      router.push("/staff/auth/signin");
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        setError("This email is already registered.");
      } else if (err.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else if (err.code === "auth/weak-password") {
        setError("Password must be at least 6 characters.");
      } else {
        setError("Failed to create account. Try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Sign-up</h1>

      <div className={styles.form}>
        <div className={styles.inputGroup}>
          <label className={styles.label}>Username</label>
          <input
            type="text"
            className={styles.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label}>Email</label>
          <input
            type="email"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label}>Password</label>

          <div className={styles.passwordWrapper}>
            <input
              type={showPassword ? "text" : "password"}
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
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

        {error && <p style={{ color: "red", fontSize: "13px" }}>{error}</p>}

        <p className={styles.loginText}>
          Already have an account?{" "}
          <Link href="/staff/auth/signin" className={styles.loginLink}>
            Sign in here
          </Link>
        </p>

        <button
          className={styles.signupButton}
          onClick={handleSignup}
          disabled={loading}
        >
          {loading ? "Signing up..." : "Sign up"}
        </button>
      </div>
    </div>
  );
}
