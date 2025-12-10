"use client";

import { useEffect, useState } from "react";
import SideNavbar from "@/components/sideNavbar";
import { db } from "@/firebase/firebase.config";
import { collection, getDocs } from "firebase/firestore";
import Link from "next/link";

export default function Dashboard() {
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "jobs"));
        const jobsList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setJobs(jobsList);
      } catch (error) {
        console.error("Error fetching jobs:", error);
      }
    };
    fetchJobs();
  }, []);

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar added here */}
      <SideNavbar activeKey="jobs" />

      {/* Main Content Area */}
      <main className="flex-1 p-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Job Quotations</h1>
          <Link href="/dashboard/create-job">
            <button className="bg-green-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-green-700 transition-colors shadow-sm">
              + New Job
            </button>
          </Link>
        </div>

        <div className="grid gap-4">
          {jobs.length === 0 ? (
            <p className="text-gray-500 text-center py-10">No jobs found. Click "New Job" to create one.</p>
          ) : (
            jobs.map((job) => (
              <Link key={job.id} href={`/dashboard/job/${job.id}`}>
                <div className="border border-gray-200 p-5 rounded-xl bg-white hover:shadow-md cursor-pointer transition-shadow flex justify-between items-center">
                  <div>
                    <h2 className="font-bold text-lg text-gray-900">{job.clientName || "Unnamed Client"}</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {job.clientAddress ? `📍 ${job.clientAddress}` : "No address"}
                    </p>
                  </div>
                  
                  <div className="text-right">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide
                      ${job.status === 'approved' ? 'bg-green-100 text-green-700' : 
                        job.status === 'pending' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                      {job.status || "Draft"}
                    </span>
                    <p className="text-xs text-gray-400 mt-2">
                      {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </main>
    </div>
  );
}