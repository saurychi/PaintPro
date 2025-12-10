"use client"

import SideNavbar from "@/components/sideNavbar";
import { auth } from "@/firebase/firebase.config";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function Dashboard() {
    
    const router = useRouter();
    const handleLogout = async () => {
        await signOut(auth);
        router.push("/staff/auth/signin");
    }

    return (
        <div style={{ display: "flex" }}>
            <SideNavbar activeKey="jobs" />
            <main style={{ flex: 1 }}>
                Dashboard
                <div className="flex flex-col">
                    Logged in as: {auth.currentUser?.displayName ?? "Unknown User"}
                    <button className="button bg-red-500 text-white w-20" onClick={handleLogout}>Log out</button>
                </div>
            </main>
        </div>
    );
}
