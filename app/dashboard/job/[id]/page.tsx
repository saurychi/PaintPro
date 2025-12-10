"use client";
import { useEffect, useState, use} from "react";
import { db } from "@/firebase/firebase.config";
import { doc, getDoc } from "firebase/firestore";
import { Job, Task } from "@/types"; // This import should work now!

export default function JobDetailsPage({ params }: {params: Promise<{ id: string }> }) {
  const { id } = use(params);
  
    const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJob = async () => {
      // In Next.js 15+, params might need to be awaited or accessed differently depending on version.
      // If this errors, try: const { id } = React.use(params);
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

  if (loading) return <div className="p-8">Loading Quote...</div>;
  if (!job) return <div className="p-8">Job not found</div>;

  // Helper to calculate task total (labor + materials)
  const calculateTaskTotal = (task: Task) => {
    const materialCost = task.materials.reduce((sum, mat) => sum + mat.cost, 0);
    return task.laborCost + materialCost;
  };

  // Grand total
  const grandTotal = job.tasks.reduce((sum, task) => sum + calculateTaskTotal(task), 0);

  return (
    <div className="flex flex-col lg:flex-row gap-8 p-8 bg-gray-50 min-h-screen font-sans text-gray-800">
      
      {/* LEFT SIDE: THE QUOTATION PAPER */}
      <div className="flex-1 bg-white shadow-lg p-8 rounded-lg max-w-4xl mx-auto">
        
        {/* Header Section */}
        <div className="flex justify-between items-start border-b pb-8 mb-8 bg-gray-800 text-white -m-8 p-8 rounded-t-lg">
          <div>
            <h1 className="text-4xl font-bold">Quote</h1>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold">PAINT PRO</h2>
            <p className="text-sm text-gray-300">Painting and Decorating</p>
            <div className="mt-4 text-sm text-gray-300">
              <p>📞 +1 234 567 890</p>
              <p>✉️ quotes@paintpro.com</p>
            </div>
          </div>
        </div>

        {/* Client Info */}
        <div className="mb-10">
          <h3 className="text-xl font-bold text-gray-900">{job.clientName}</h3>
          <p className="text-gray-500 text-sm">Job #{job.id?.slice(0, 8).toUpperCase()}</p>
          <p className="text-gray-500 mt-2">{job.clientAddress || "No address provided"}</p>
          <p className="text-gray-500">{job.startDate} to {job.endDate}</p>
        </div>

        {/* Tasks Table */}
        <div className="mb-8">
          <h3 className="text-lg font-bold mb-4 border-b pb-2">Tasks</h3>
          
          <div className="space-y-6">
            {job.tasks.map((task, index) => (
              <div key={index} className="border border-gray-200 rounded-md overflow-hidden">
                {/* Task Header */}
                <div className="bg-gray-100 px-4 py-2 font-bold flex justify-between">
                  <span>{task.description || "Untitled Task"}</span>
                  <span>${calculateTaskTotal(task).toFixed(2)}</span>
                </div>
                
                {/* Task Breakdown (Rows) */}
                <div className="text-sm">
                  {/* Labor Row */}
                  <div className="flex justify-between px-4 py-2 border-b border-gray-100">
                    <span className="text-gray-600 pl-4">Labor / Services</span>
                    <span>${task.laborCost.toFixed(2)}</span>
                  </div>

                  {/* Materials Rows */}
                  {task.materials.map((mat, mIndex) => (
                    <div key={mIndex} className="flex justify-between px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                      <span className="text-gray-600 pl-4">• {mat.name}</span>
                      <span>${mat.cost.toFixed(2)}</span>
                    </div>
                  ))}
                  
                  {/* Task Subtotal */}
                  <div className="flex justify-between px-4 py-2 bg-gray-50 font-semibold">
                    <span className="text-right w-full pr-4">Total:</span>
                    <span>${calculateTaskTotal(task).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Grand Total */}
        <div className="flex justify-end mt-8 pt-4 border-t-2 border-gray-800">
          <div className="text-right">
            <span className="text-xl font-bold mr-4">Grand Total:</span>
            <span className="text-2xl font-bold text-green-600">${grandTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: CONTROLS (Status & Actions) */}
      <div className="w-full lg:w-80 flex flex-col gap-6">
        
        {/* Status Card */}
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="font-bold mb-4">Status</h3>
          <div className={`text-center py-3 rounded font-bold capitalize
            ${job.status === 'approved' ? 'bg-green-100 text-green-700' : 
              job.status === 'pending' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100'}`}>
            {job.status || "Draft"}
          </div>
        </div>

        {/* Send Quotation Card */}
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="font-bold mb-4">Send Quotation</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Send to Client</label>
              <select className="w-full border p-2 rounded mt-1 bg-white">
                <option>{job.clientName}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Or Email</label>
              <input type="email" placeholder="example@email.com" className="w-full border p-2 rounded mt-1" />
            </div>
            <button className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700">
              Send Email
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}