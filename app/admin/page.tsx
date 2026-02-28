"use client"

import CurrentJobCard from "../../components/currentJobCard"
import EmployeesCard, { Employee } from "../../components/employeesCard"
import NotificationsCard, { NotificationItem } from "../../components/notificationsCard"
import AnalyticsCard from "../../components/analyticsCard"
import JobCostSpreadCard, { CostSlice } from "../../components/jobCostSpreadCard"
import JobProgressCard from "../../components/jobProgressCard"
import { useRouter } from "next/navigation"

export default function DashboardPage() {
  const router = useRouter();

  const employees: Employee[] = [
    { id: "e1", name: "Marco Dela Cruz", role: "Painter", status: "Worked", avatarUrl: "/avatars/1.jpg" },
    { id: "e2", name: "Ramon Santos", role: "Painter", status: "On-leave", avatarUrl: "/avatars/2.jpg" },
    { id: "e3", name: "Jessa Mendoza", role: "Painter", status: "Worked", avatarUrl: "/avatars/3.jpg" },
  ]

  const notifications: NotificationItem[] = [
    { id: "n1", title: "The client changed their p...", subtitle: "Ramon Dela Cruz", isUnread: true },
    { id: "n2", title: "The client changed their p...", subtitle: "Marco Dela Cruz", isUnread: false },
  ]

  const costSpread: CostSlice[] = [
    { label: "Labor Cost", percent: 30 },
    { label: "Transportation Cost", percent: 30 },
    { label: "Materials Cost", percent: 30 },
    { label: "Nigger Cost", percent: 10 },
  ]

  // ... (Keep your existing types for ServiceGroup/ServiceStep) ...
  type ServiceStepStatus = "done" | "active" | "pending"

  type ServiceStep = {
    id: string
    title: string
    scheduledAt?: string
    finishedAt?: string
    status: ServiceStepStatus
    assignedTo?: string
    materialsNeeded?: string
  }

  type ServiceGroup = {
    id: string
    title: string
    scheduledAt?: string
    finishedAt?: string
    status: ServiceStepStatus
    children: ServiceStep[]
  }

  const services: ServiceGroup[] = [
    {
      id: "svc-spray",
      title: "Spray or Brush Roll Finish",
      scheduledAt: "01 July 2024, 9:30 AM",
      finishedAt: undefined,
      status: "active",
      children: [
        {
          id: "svc-spray-1",
          title: "Prepare paint needed",
          scheduledAt: "01 July 2024, 9:30 AM",
          finishedAt: "01 July 2024, 9:45 AM",
          assignedTo: "Marco Dela Cruz",
          materialsNeeded: "1 Bucket of Boysen green paint",
          status: "done",
        },
        {
          id: "svc-spray-2",
          title: "Apply base coat on left side wall",
          scheduledAt: "01 July 2024, 9:45 AM",
          finishedAt: "01 July 2024, 10:10 AM",
          assignedTo: "Marco Dela Cruz",
          materialsNeeded: "1 Bucket of Boysen green paint",
          status: "done",
        },
        {
          id: "svc-spray-3",
          title: "Apply second coat on left side wall",
          scheduledAt: "01 July 2024, 10:10 AM",
          finishedAt: undefined,
          status: "active",
          assignedTo: "Marco Dela Cruz",
          materialsNeeded: "1 Bucket of Boysen green paint",
        },
        {
          id: "svc-spray-4",
          title: "Clean and prep tools post-application",
          scheduledAt: "01 July 2024, 10:30 AM",
          finishedAt: undefined,
          status: "pending",
        },
      ],
    },
    {
      id: "svc-wallpaper",
      title: "Wallpapering",
      scheduledAt: "01 July 2024, 11:15 AM",
      finishedAt: undefined,
      status: "pending",
      children: [
        {
          id: "svc-wallpaper-1",
          title: "Measure and mark wall for wallpaper alignment",
          scheduledAt: "01 July 2024, 11:15 AM",
          finishedAt: undefined,
          status: "pending",
        },
        {
          id: "svc-wallpaper-2",
          title: "Apply wallpaper to left side wall section",
          scheduledAt: "01 July 2024, 11:40 AM",
          finishedAt: undefined,
          status: "pending",
        },
      ],
    },
  ]

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12 items-stretch">

        <div className="lg:col-span-3 h-[200px]">
          <CurrentJobCard
            statusLabel="Work in progress"
            jobNo="#0000001A-2024"
            siteName="Dawn House"
            onCreateJob={() => console.log("Create job")}
          />
        </div>

        <div className="lg:col-span-6 h-[200px]">
          <EmployeesCard employees={employees} />
        </div>

        <div className="lg:col-span-3 h-[200px]">
          <NotificationsCard
            notifications={notifications}
            onOpenAll={() => router.push("/admin/messages")}
          />
        </div>

        {/* Bottom row */}
        <div className="lg:col-span-9 h-[375px] min-h-0">
          <JobProgressCard
            services={services}
            onSeeMore={(id) => console.log("See more:", id)}
            onDownpayment={() => console.log("Downpayment")}
            onStartJob={() => console.log("Start Job")}
            onCreateInvoice={() => router.push("/admin/[job_id]/invoice")}
            onAddPayment={() => console.log("Add Payment")}
            onEmployeeManagement={() => console.log("Employee Management")}
            onConcludeJob={() => console.log("Conclude Job")}
          />
        </div>

        <div className="lg:col-span-3 h-[375px] min-h-0 flex flex-col justify-between">
          <div className="min-h-0">
            <AnalyticsCard percentComplete={45} currentTaskLabel="Spray or Brush Roll Finish" />
          </div>

          <div className="min-h-0">
            <JobCostSpreadCard items={costSpread} />
          </div>
        </div>
      </div>
    </div>
  )
}