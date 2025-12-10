"use client";

// export default function Dashboard() {
//     return (
//         <div style={{ display: "flex" }}>
//             <SideNavbar activeKey="jobs" />
//             <main style={{ flex: 1 }}>
//                 Dashboard
//             </main>
//         </div>
//     );
// }

import { useEffect, useState } from "react";
import SideNavbar from "@/components/sideNavbar";
import { db } from "@/firebase/firebase.config";
import { collection, getDocs } from "firebase/firestore";
import Link from "next/link";

export default function Dashboard() {
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    const fetchJobs = async () => {
      const querySnapshot = await getDocs(collection(db, "jobs"));
      const jobsList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setJobs(jobsList);
    };
    fetchJobs();
  }, []);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Job Quotations</h1>
        <Link href="/dashboard/create-job">
          <button className="bg-green-500 text-white px-4 py-2 rounded">New Job</button>
        </Link>
      </div>

      <div className="grid gap-4">
        {jobs.map((job) => (
          <Link key={job.id} href={`/dashboard/job/${job.id}`}>
            <div className="border p-4 rounded hover:shadow-md cursor-pointer bg-white">
              <h2 className="font-bold text-lg">{job.clientName || "Unnamed Client"}</h2>
              <p className="text-gray-500">Status: {job.status}</p>
              {/* You can calculate total cost here using a helper function */}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}