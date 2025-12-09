import SideNavbar from "@/components/sideNavbar";

export default function Dashboard() {
    return (
        <div style={{ display: "flex" }}>
            <SideNavbar activeKey="jobs" />
            <main style={{ flex: 1 }}>
                Dashboard
            </main>
        </div>
    );
}
