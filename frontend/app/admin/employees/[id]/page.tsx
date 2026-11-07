
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import AdminSidebar from "@/components/AdminSidebar";

interface Employee {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
}

interface Task {
  id: number;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assigned_to: number;
  due_date?: string;
}

export default function EmployeeDetailsPage() {
  const router = useRouter();
  const params = useParams();

  const employeeId = Number(params.id);

  const [adminName, setAdminName] = useState("Admin");
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const role = localStorage.getItem("role");

    if (!token || role !== "admin") {
      router.replace("/login");
      return;
    }

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      setError("Invalid employee ID.");
      setLoading(false);
      return;
    }

    const headers = {
      Authorization: `Bearer ${token}`,
    };

    const fetchEmployeeDetails = async () => {
      try {
        const [profileResponse, employeeResponse, taskResponse] =
          await Promise.all([
            api.get("/me", { headers }),
            api.get("/employees/", { headers }),
            api.get("/tasks/", { headers }),
          ]);

        setAdminName(profileResponse.data.name);

        const selectedEmployee = employeeResponse.data.find(
          (item: Employee) => item.id === employeeId
        );

        if (!selectedEmployee) {
          setError("Employee not found.");
          return;
        }

        setEmployee(selectedEmployee);

        const employeeTasks = taskResponse.data.filter(
          (task: Task) => task.assigned_to === employeeId
        );

        setTasks(employeeTasks);
      } catch (err: any) {
        console.error("Employee details error:", err);

        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("role");
          router.replace("/login");
          return;
        }

        setError(
          err.response?.data?.detail ||
            "Unable to load employee details."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchEmployeeDetails();
  }, [employeeId, router]);

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("role");
    router.replace("/login");
  };

  const completedTasks = tasks.filter(
    (task) => task.status.toLowerCase() === "completed"
  ).length;

  const pendingTasks = tasks.filter(
    (task) => task.status.toLowerCase() === "pending"
  ).length;

  const inProgressTasks = tasks.filter(
    (task) => task.status.toLowerCase() === "in progress"
  ).length;

  const getStatusStyle = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return "bg-green-50 text-green-700";
      case "in progress":
        return "bg-blue-50 text-blue-700";
      default:
        return "bg-amber-50 text-amber-700";
    }
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority.toLowerCase()) {
      case "high":
        return "bg-red-50 text-red-700";
      case "medium":
        return "bg-amber-50 text-amber-700";
      default:
        return "bg-green-50 text-green-700";
    }
  };

  return (
    <>
      <AdminSidebar name={adminName} onLogout={handleLogout} />

      <main className="min-h-screen bg-slate-50 px-4 pb-10 pt-20 sm:px-6 lg:ml-64 lg:px-8 lg:pt-10">
        <div className="mx-auto max-w-7xl">

          <button
            onClick={() => router.push("/admin/employees")}
            className="mb-6 text-sm font-semibold text-blue-600 hover:text-blue-800"
          >
            ← Back to Employees
          </button>

          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
              Loading employee details...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-white p-8 text-center text-red-600">
              {error}
            </div>
          ) : employee ? (
            <>
              {/* Employee Profile */}
              <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-2xl font-bold text-blue-700">
                    {employee.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1">
                    <h1 className="text-2xl font-bold text-slate-900">
                      {employee.name}
                    </h1>

                    <p className="mt-1 text-sm text-slate-500">
                      {employee.email}
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      Employee ID: {employee.id}
                    </p>
                  </div>

                  <span
                    className={`w-fit rounded-full px-4 py-2 text-xs font-semibold ${
                      employee.is_active
                        ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {employee.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </section>

              {/* Task Statistics */}
              <section className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm text-slate-500">Total Tasks</p>
                  <h2 className="mt-3 text-3xl font-bold text-slate-900">
                    {tasks.length}
                  </h2>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm text-slate-500">Completed</p>
                  <h2 className="mt-3 text-3xl font-bold text-green-600">
                    {completedTasks}
                  </h2>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm text-slate-500">In Progress</p>
                  <h2 className="mt-3 text-3xl font-bold text-blue-600">
                    {inProgressTasks}
                  </h2>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm text-slate-500">Pending</p>
                  <h2 className="mt-3 text-3xl font-bold text-amber-600">
                    {pendingTasks}
                  </h2>
                </div>
              </section>

              {/* Assigned Tasks */}
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 p-5">
                  <h2 className="text-lg font-bold text-slate-900">
                    Assigned Tasks
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Tasks assigned to {employee.name}
                  </p>
                </div>

                {tasks.length === 0 ? (
                  <div className="p-12 text-center text-sm text-slate-500">
                    No tasks have been assigned to this employee yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-left">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-6 py-4 text-xs font-semibold uppercase text-slate-500">
                            Task
                          </th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase text-slate-500">
                            Priority
                          </th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase text-slate-500">
                            Status
                          </th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase text-slate-500">
                            Due Date
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {tasks.map((task) => (
                          <tr
                            key={task.id}
                            className="transition hover:bg-slate-50"
                          >
                            <td className="px-6 py-4">
                              <p className="font-semibold text-slate-800">
                                {task.title}
                              </p>
                              {task.description && (
                                <p className="mt-1 max-w-sm truncate text-xs text-slate-500">
                                  {task.description}
                                </p>
                              )}
                            </td>

                            <td className="px-6 py-4">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${getPriorityStyle(task.priority)}`}
                              >
                                {task.priority}
                              </span>
                            </td>

                            <td className="px-6 py-4">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyle(task.status)}`}
                              >
                                {task.status}
                              </span>
                            </td>

                            <td className="px-6 py-4 text-sm text-slate-600">
                              {task.due_date
                                ? new Date(task.due_date).toLocaleDateString()
                                : "Not specified"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </main>
    </>
  );
}
