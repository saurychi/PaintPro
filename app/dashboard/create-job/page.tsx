"use client";
import { useState } from "react";
import { db } from "@/firebase/firebase.config";
import { collection, addDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

// Define local interfaces if not imported from @/types
interface Material {
  name: string;
  cost: number;
}

interface Dimensions {
  length: number;
  width: number;
  height: number;
  unit: string;
}

interface Task {
  description: string;
  laborCost: number;
  materials: Material[];
  dimensions: Dimensions;
}

export default function CreateJobPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // --- Job Details State ---
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  
  // --- Employee State ---
  const [employeeInput, setEmployeeInput] = useState("");
  const [assignedEmployees, setAssignedEmployees] = useState<string[]>([]);

  // --- Task State ---
  const [tasks, setTasks] = useState<Task[]>([
    { 
      description: "", 
      laborCost: 0, 
      materials: [], 
      dimensions: { length: 0, width: 0, height: 0, unit: "ft" } 
    }
  ]);

  // --- Handlers ---

  const handleAddEmployee = () => {
    if (employeeInput.trim()) {
      setAssignedEmployees([...assignedEmployees, employeeInput.trim()]);
      setEmployeeInput("");
    }
  };

  const removeEmployee = (index: number) => {
    setAssignedEmployees(assignedEmployees.filter((_, i) => i !== index));
  };

  const addTask = () => {
    setTasks([
      ...tasks, 
      { 
        description: "", 
        laborCost: 0, 
        materials: [], 
        dimensions: { length: 0, width: 0, height: 0, unit: "ft" } 
      }
    ]);
  };

  const removeTask = (index: number) => {
    setTasks(tasks.filter((_, i) => i !== index));
  };

  const updateTask = (index: number, field: keyof Task, value: any) => {
    const newTasks = [...tasks];
    newTasks[index] = { ...newTasks[index], [field]: value };
    setTasks(newTasks);
  };

  const updateDimensions = (taskIndex: number, field: keyof Dimensions, value: any) => {
    const newTasks = [...tasks];
    newTasks[taskIndex].dimensions = { 
      ...newTasks[taskIndex].dimensions, 
      [field]: value 
    };
    setTasks(newTasks);
  };

  const addMaterialToTask = (taskIndex: number) => {
    const newTasks = [...tasks];
    newTasks[taskIndex].materials.push({ name: "", cost: 0 });
    setTasks(newTasks);
  };

  const updateMaterial = (taskIndex: number, materialIndex: number, field: keyof Material, value: any) => {
    const newTasks = [...tasks];
    newTasks[taskIndex].materials[materialIndex] = {
      ...newTasks[taskIndex].materials[materialIndex],
      [field]: value
    };
    setTasks(newTasks);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const jobData = {
        clientName,
        clientAddress,
        startDate,
        endDate,
        jobDescription,
        assignedEmployees,
        tasks,
        status: "pending",
        createdAt: Date.now(),
      };

      await addDoc(collection(db, "jobs"), jobData);
      alert("Job Created Successfully!");
      router.push("/dashboard");
    } catch (error) {
      console.error("Error adding document: ", error);
      alert("Error creating job");
    }
    setLoading(false);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto bg-white min-h-screen">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">Create New Job Quotation</h1>
      
      <form onSubmit={handleSubmit} className="space-y-8">
        
        {/* Section 1: Client & Job Details */}
        <section className="space-y-4 border-b pb-6">
          <h2 className="text-xl font-semibold text-gray-700">Client & Job Details</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-600">Client Name</label>
              <input 
                required
                type="text" 
                placeholder="e.g. John Doe" 
                className="border p-3 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                onChange={(e) => setClientName(e.target.value)} 
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-600">Client Address</label>
              <input 
                type="text" 
                placeholder="e.g. 123 Maple Street" 
                className="border p-3 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                onChange={(e) => setClientAddress(e.target.value)} 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-600">Start Date</label>
              <input 
                type="date" 
                className="border p-3 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                onChange={(e) => setStartDate(e.target.value)} 
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-600">End Date</label>
              <input 
                type="date" 
                className="border p-3 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                onChange={(e) => setEndDate(e.target.value)} 
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-600">Job Description</label>
            <textarea 
              rows={3}
              placeholder="Describe the scope of work..." 
              className="border p-3 rounded-lg focus:ring-2 focus:ring-green-500 outline-none resize-none"
              onChange={(e) => setJobDescription(e.target.value)} 
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-600">Assign Employees</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={employeeInput}
                placeholder="Employee Name" 
                className="border p-3 rounded-lg flex-1 outline-none"
                onChange={(e) => setEmployeeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddEmployee())}
              />
              <button 
                type="button" 
                onClick={handleAddEmployee}
                className="bg-gray-800 text-white px-6 rounded-lg hover:bg-gray-700"
              >
                Add
              </button>
            </div>
            {/* Employee Tags */}
            <div className="flex flex-wrap gap-2 mt-2">
              {assignedEmployees.map((emp, idx) => (
                <span key={idx} className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                  {emp}
                  <button type="button" onClick={() => removeEmployee(idx)} className="text-green-600 hover:text-green-900 font-bold">×</button>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Section 2: Tasks & Dimensions */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-700">Tasks, Dimensions & Costs</h2>
          
          {tasks.map((task, tIndex) => (
            <div key={tIndex} className="border border-gray-200 p-6 rounded-xl bg-gray-50 shadow-sm relative">
              {/* Remove Task Button */}
              {tasks.length > 1 && (
                <button 
                  type="button" 
                  onClick={() => removeTask(tIndex)}
                  className="absolute top-4 right-4 text-red-500 hover:text-red-700 text-sm font-semibold"
                >
                  Delete Task
                </button>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Task Description</label>
                  <input 
                    placeholder="e.g. Painting Living Room Walls" 
                    className="w-full border p-2 rounded bg-white"
                    value={task.description}
                    onChange={(e) => updateTask(tIndex, "description", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Labor Cost ($)</label>
                  <input 
                    type="number" 
                    placeholder="0.00" 
                    className="w-full border p-2 rounded bg-white"
                    onChange={(e) => updateTask(tIndex, "laborCost", parseFloat(e.target.value))}
                  />
                </div>
              </div>

              {/* Dimensions Row */}
              <div className="bg-white p-3 rounded border border-gray-200 mb-4">
                <span className="text-xs font-bold text-gray-500 uppercase block mb-2">Room Dimensions</span>
                <div className="flex gap-4 items-center">
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-sm text-gray-600">L:</span>
                    <input type="number" className="border p-1 rounded w-full" placeholder="Length" onChange={(e) => updateDimensions(tIndex, "length", e.target.value)} />
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-sm text-gray-600">W:</span>
                    <input type="number" className="border p-1 rounded w-full" placeholder="Width" onChange={(e) => updateDimensions(tIndex, "width", e.target.value)} />
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-sm text-gray-600">H:</span>
                    <input type="number" className="border p-1 rounded w-full" placeholder="Height" onChange={(e) => updateDimensions(tIndex, "height", e.target.value)} />
                  </div>
                  <div className="w-24">
                    <select 
                      className="border p-1 rounded w-full bg-white"
                      value={task.dimensions.unit}
                      onChange={(e) => updateDimensions(tIndex, "unit", e.target.value)}
                    >
                      <option value="ft">ft</option>
                      <option value="m">m</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Materials */}
              <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Materials</h4>
                <div className="space-y-2">
                  {task.materials.map((mat, mIndex) => (
                    <div key={mIndex} className="flex gap-2">
                      <input 
                        placeholder="Material Name" 
                        className="flex-1 border p-2 rounded text-sm"
                        value={mat.name}
                        onChange={(e) => updateMaterial(tIndex, mIndex, "name", e.target.value)}
                      />
                      <input 
                        type="number" 
                        placeholder="Cost" 
                        className="w-32 border p-2 rounded text-sm"
                        value={mat.cost || ''}
                        onChange={(e) => updateMaterial(tIndex, mIndex, "cost", parseFloat(e.target.value))}
                      />
                    </div>
                  ))}
                </div>
                <button 
                  type="button" 
                  onClick={() => addMaterialToTask(tIndex)} 
                  className="text-sm text-blue-600 hover:text-blue-800 mt-2 font-medium flex items-center gap-1"
                >
                  + Add Material
                </button>
              </div>
            </div>
          ))}
          
          <button 
            type="button" 
            onClick={addTask} 
            className="w-full border-2 border-dashed border-gray-300 text-gray-500 py-3 rounded-lg hover:border-green-500 hover:text-green-600 transition-colors font-semibold"
          >
            + Add New Task
          </button>
        </section>

        <div className="pt-6 border-t">
          <button 
            disabled={loading} 
            type="submit" 
            className="w-full bg-green-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-green-700 transition-colors shadow-lg"
          >
            {loading ? "Generating..." : "Generate Quotation"}
          </button>
        </div>
      </form>
    </div>
  );
}