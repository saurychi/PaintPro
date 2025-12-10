"use client";
import { useState } from "react";
import { db } from "@/firebase/firebase.config"; // Your firebase config
import { collection, addDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Job, Task } from "@/types"; // Import the types we defined above

export default function CreateJobPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  // State for the form
  const [clientName, setClientName] = useState("");
  const [startDate, setStartDate] = useState("");
  
  // Complex state for Tasks
  const [tasks, setTasks] = useState<Task[]>([
    { description: "", laborCost: 0, materials: [], assignedEmployees: [] }
  ]);

  // --- Handlers for Dynamic Fields ---

  // 1. Add a new empty Task
  const addTask = () => {
    setTasks([...tasks, { description: "", laborCost: 0, materials: [], assignedEmployees: [] }]);
  };

  // 2. Update a specific Task's description or cost
  const updateTask = (index: number, field: keyof Task, value: any) => {
    const newTasks = [...tasks];
    newTasks[index] = { ...newTasks[index], [field]: value };
    setTasks(newTasks);
  };

  // 3. Add a Material to a specific Task
  const addMaterialToTask = (taskIndex: number) => {
    const newTasks = [...tasks];
    newTasks[taskIndex].materials.push({ name: "", cost: 0 });
    setTasks(newTasks);
  };

  // 4. Update a specific Material inside a specific Task
  const updateMaterial = (taskIndex: number, materialIndex: number, field: string, value: any) => {
    const newTasks = [...tasks];
    // @ts-ignore
    newTasks[taskIndex].materials[materialIndex][field] = value;
    setTasks(newTasks);
  };

  // --- Submit to Firebase ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const jobData = {
        clientName,
        startDate,
        tasks,
        status: "pending",
        createdAt: Date.now(),
      };

      // Add to Firestore "jobs" collection
      await addDoc(collection(db, "jobs"), jobData);
      
      alert("Job Created!");
      router.push("/dashboard"); // Go back to list
    } catch (error) {
      console.error("Error adding document: ", error);
    }
    setLoading(false);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create New Job Quotation</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <input 
            type="text" 
            placeholder="Client Name" 
            className="border p-2 rounded"
            onChange={(e) => setClientName(e.target.value)} 
          />
           <input 
            type="date" 
            className="border p-2 rounded"
            onChange={(e) => setStartDate(e.target.value)} 
          />
        </div>

        {/* Dynamic Tasks Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Tasks & Costs</h2>
          {tasks.map((task, tIndex) => (
            <div key={tIndex} className="border p-4 rounded bg-gray-50">
              <div className="flex gap-2 mb-2">
                <input 
                  placeholder="Task Description (e.g., Wallpapering)" 
                  className="flex-1 border p-2"
                  value={task.description}
                  onChange={(e) => updateTask(tIndex, "description", e.target.value)}
                />
                <input 
                  type="number" 
                  placeholder="Labor Cost" 
                  className="w-32 border p-2"
                  onChange={(e) => updateTask(tIndex, "laborCost", parseFloat(e.target.value))}
                />
              </div>

              {/* Nested Materials for this Task */}
              <div className="ml-8 mt-2">
                <h4 className="text-sm font-bold">Materials</h4>
                {task.materials.map((mat, mIndex) => (
                  <div key={mIndex} className="flex gap-2 mt-1">
                    <input 
                      placeholder="Material Name" 
                      className="border p-1 text-sm"
                      onChange={(e) => updateMaterial(tIndex, mIndex, "name", e.target.value)}
                    />
                    <input 
                      type="number" 
                      placeholder="Cost" 
                      className="w-24 border p-1 text-sm"
                      onChange={(e) => updateMaterial(tIndex, mIndex, "cost", parseFloat(e.target.value))}
                    />
                  </div>
                ))}
                <button type="button" onClick={() => addMaterialToTask(tIndex)} className="text-xs text-blue-500 mt-1">+ Add Material</button>
              </div>
            </div>
          ))}
          <button type="button" onClick={addTask} className="bg-green-600 text-white px-4 py-2 rounded">+ Add New Task</button>
        </div>

        <button disabled={loading} type="submit" className="w-full bg-blue-600 text-white py-3 rounded font-bold">
          {loading ? "Generating..." : "Generate Quotation"}
        </button>
      </form>
    </div>
  );
}