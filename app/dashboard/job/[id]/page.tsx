"use client";
import { useEffect, useState, use } from "react";
import { db } from "@/firebase/firebase.config";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

// Define interface locally
interface Job {
  id?: string;
  clientName: string;
  clientAddress?: string;
  startDate: string;
  endDate?: string;
  jobDescription?: string;
  assignedEmployees?: string[];
  status: string;
  tasks: {
    description: string;
    laborCost: number;
    dimensions?: { length: number; width: number; height: number; unit: string };
    materials: { name: string; cost: number }[];
  }[];
}

export default function JobDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJob = async () => {
      if (!id) return;
      const docRef = doc(db, "jobs", id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setJob({ id: docSnap.id, ...docSnap.data() } as Job);
      }
      setLoading(false);
    };
    fetchJob();
  }, [id]);

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this job? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, "jobs", id));
      router.push("/dashboard");
    } catch (err) {
      console.error("Error deleting job:", err);
      alert("Failed to delete job.");
    }
  };

  const handleEdit = () => {
    // Navigate to an edit page (you would need to create app/dashboard/edit-job/[id]/page.tsx)
    // For now, we'll just log or alert
    alert("Edit functionality requires creating an edit page route.");
    // router.push(`/dashboard/edit-job/${id}`);
  };

  if (loading) return <div className="p-8">Loading Quote...</div>;
  if (!job) return <div className="p-8">Job not found</div>;

  const calculateTaskTotal = (task: any) => {
    const materialCost = task.materials?.reduce((sum: number, mat: any) => sum + mat.cost, 0) || 0;
    return (task.laborCost || 0) + materialCost;
  };

  const grandTotal = job.tasks.reduce((sum, task) => sum + calculateTaskTotal(task), 0);

  return (
    <div className="flex flex-col lg:flex-row gap-8 p-8 bg-gray-50 min-h-screen font-sans text-gray-800">
      
      {/* LEFT SIDE: THE QUOTATION PAPER */}
      <div className="flex-1 bg-white shadow-lg p-8 rounded-lg max-w-4xl mx-auto border border-gray-100">
        
        {/* Header Section */}
        <div className="flex justify-between items-start border-b-2 border-gray-100 pb-8 mb-8">
          <div>
            <h1 className="text-4xl font-extrabold text-gray-800 tracking-tight">Quotation</h1>
            <p className="text-gray-500 mt-2">Job ID: #{job.id?.slice(0, 8).toUpperCase()}</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold text-green-600">PAINT PRO</h2>
            <p className="text-sm text-gray-500">Painting & Decorating Services</p>
            <div className="mt-2 text-sm text-gray-400">
              <p>123 Business Rd, City</p>
              <p>contact@paintpro.com</p>
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Bill To</h3>
            <p className="text-lg font-bold text-gray-900">{job.clientName}</p>
            {job.clientAddress && <p className="text-gray-600">{job.clientAddress}</p>}
          </div>
          <div className="text-right">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Job Dates</h3>
            <p className="text-gray-800 font-medium">Start: {job.startDate}</p>
            {job.endDate && <p className="text-gray-800 font-medium">End: {job.endDate}</p>}
          </div>
        </div>

        {/* Job Description */}
        {job.jobDescription && (
          <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-100">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Scope of Work</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{job.jobDescription}</p>
          </div>
        )}

        {/* Employees */}
        {job.assignedEmployees && job.assignedEmployees.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Assigned Crew</h3>
            <div className="flex flex-wrap gap-2">
              {job.assignedEmployees.map((emp, i) => (
                <span key={i} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold border border-blue-100">
                  {emp}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tasks Table */}
        <div className="mb-8">
          <h3 className="text-lg font-bold mb-4 text-gray-800">Tasks Breakdown</h3>
          
          <div className="space-y-6">
            {job.tasks.map((task, index) => (
              <div key={index} className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                {/* Task Header */}
                <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-gray-800 block">{task.description || "Untitled Task"}</span>
                    {task.dimensions && (
                      <span className="text-xs text-gray-500">
                        Dim: {task.dimensions.length}x{task.dimensions.width}x{task.dimensions.height} {task.dimensions.unit}
                      </span>
                    )}
                  </div>
                  <span className="font-bold text-gray-900">${calculateTaskTotal(task).toFixed(2)}</span>
                </div>
                
                {/* Task Body */}
                <div className="p-4 bg-white">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">Labor Cost</span>
                    <span className="font-mono">${task.laborCost.toFixed(2)}</span>
                  </div>
                  
                  {task.materials && task.materials.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs font-bold text-gray-400 uppercase mb-2">Materials</p>
                      {task.materials.map((mat, mIndex) => (
                        <div key={mIndex} className="flex justify-between text-sm text-gray-600 mb-1">
                          <span>• {mat.name}</span>
                          <span className="font-mono text-gray-500">${mat.cost.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Grand Total */}
        <div className="flex justify-end pt-6 border-t-2 border-gray-900">
          <div className="text-right">
            <span className="text-gray-500 mr-4 font-medium">Total Estimate</span>
            <span className="text-3xl font-extrabold text-green-600">${grandTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: CONTROLS */}
      <div className="w-full lg:w-72 flex flex-col gap-6">
        
        {/* Actions Card */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-bold text-gray-800 mb-4">Actions</h3>
          <div className="flex flex-col gap-3">
            <button 
              onClick={handleEdit}
              className="w-full bg-gray-100 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
            >
              Edit Quote
            </button>
            <button 
              onClick={handleDelete}
              className="w-full bg-red-50 text-red-600 py-2 rounded-lg font-semibold hover:bg-red-100 transition-colors border border-red-100"
            >
              Delete Job
            </button>
          </div>
        </div>

        {/* Status Card */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-bold text-gray-800 mb-2">Status</h3>
          <div className={`text-center py-2 rounded-lg font-bold uppercase text-sm tracking-wide
            ${job.status === 'approved' ? 'bg-green-100 text-green-700' : 
              job.status === 'pending' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
            {job.status || "Draft"}
          </div>
        </div>

        {/* Send Email Card */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-bold text-gray-800 mb-4">Send via Email</h3>
          <div className="space-y-3">
            <input type="email" placeholder="client@email.com" className="w-full border p-2 rounded-lg text-sm bg-gray-50 focus:bg-white transition-colors outline-none focus:ring-2 focus:ring-blue-100" />
            <button className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-blue-200 shadow-lg">
              Send Quotation
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}