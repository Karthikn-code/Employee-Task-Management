
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import AdminSidebar from "@/components/AdminSidebar";

interface Employee {
  id: number;
  name: string;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at?: string;
}

interface Task {
  id: number;
  title: string;
  assigned_to: number | null;
  status: string;
}

interface EmployeeForm {
  name: string;
  username: string;
  email: string;
  password: string;
}

interface EditEmployeeForm {
  name: string;
  username: string;
  email: string;
}

type EmployeeView = "active" | "archived";
type EmployeeAction = "archive" | "permanent";

export default function EmployeesPage() {
  const router = useRouter();

  // ---------------- MAIN STATES ----------------

  const [name, setName] = useState("Admin");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [archivedEmployees, setArchivedEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const [search, setSearch] = useState("");
  const [view, setView] = useState<EmployeeView>("active");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // ---------------- ADD EMPLOYEE STATES ----------------

  const [showAddForm, setShowAddForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const [employeeForm, setEmployeeForm] = useState<EmployeeForm>({
    name: "",
    username: "",
    email: "",
    password: "",
  });

  // ---------------- EDIT EMPLOYEE STATES ----------------

  const [showEditForm, setShowEditForm] = useState(false);
  const [editingEmployee, setEditingEmployee] =
    useState<Employee | null>(null);

  const [editEmployeeForm, setEditEmployeeForm] =
    useState<EditEmployeeForm>({
      name: "",
      username: "",
      email: "",
    });

  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  // ---------------- STATUS STATES ----------------

  const [updatingStatusId, setUpdatingStatusId] =
    useState<number | null>(null);

  const [statusError, setStatusError] = useState("");

  // ---------------- ARCHIVE / DELETE STATES ----------------

  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<EmployeeAction>("archive");
  const [selectedEmployee, setSelectedEmployee] =
    useState<Employee | null>(null);

  const [replacementEmployeeId, setReplacementEmployeeId] =
    useState("");

  const [actionError, setActionError] = useState("");
  const [processingAction, setProcessingAction] = useState(false);

  // ---------------- RESTORE STATES ----------------

  const [restoringId, setRestoringId] = useState<number | null>(null);

  // ---------------- AUTHENTICATION ----------------

  const getAuthHeaders = () => {
    const token = sessionStorage.getItem("access_token");

    return {
      Authorization: `Bearer ${token}`,
    };
  };

  const handleLogout = () => {
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("role");
    router.replace("/login");
  };

  // ---------------- FETCH DATA ----------------

  const fetchData = async () => {
    try {
      const headers = getAuthHeaders();

      const [
        profileResponse,
        employeeResponse,
        taskResponse,
        archivedResponse,
      ] = await Promise.all([
        api.get("/me", { headers }),
        api.get("/employees/", { headers }),
        api.get("/tasks/", { headers }),
        api.get("/admin/employees/archived", { headers }),
      ]);

      setName(profileResponse.data.name);
      setEmployees(employeeResponse.data);
      setTasks(taskResponse.data);
      setArchivedEmployees(archivedResponse.data);

      setError("");
    } catch (err: any) {
      console.error("Employee directory error:", err);

      if (err.response?.status === 401) {
        sessionStorage.removeItem("access_token");
        sessionStorage.removeItem("role");
        router.replace("/login");
        return;
      }

      setError(
        err.response?.data?.detail ||
          "Unable to load employee information."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    const role = sessionStorage.getItem("role");

    if (!token || role !== "admin") {
      router.replace("/login");
      return;
    }

    fetchData();
  }, [router]);

  // ---------------- ADD EMPLOYEE ----------------

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;

    setEmployeeForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setFormError("");
  };

  const handleCreateEmployee = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setFormError("");
    setSuccessMessage("");

    const cleanName = employeeForm.name.trim();
    const cleanUsername = employeeForm.username.trim();
    const cleanEmail = employeeForm.email.trim().toLowerCase();

    if (
      !cleanName ||
      !cleanUsername ||
      !cleanEmail ||
      !employeeForm.password
    ) {
      setFormError("Please fill in all fields.");
      return;
    }

    if (!/^[a-zA-Z0-9_]{3,50}$/.test(cleanUsername)) {
      setFormError(
        "Username must contain 3–50 characters using letters, numbers or underscores."
      );
      return;
    }

    if (employeeForm.password.length < 8) {
      setFormError(
        "Temporary password must contain at least 8 characters."
      );
      return;
    }

    try {
      setCreating(true);

      await api.post(
        "/admin/employees/",
        {
          name: cleanName,
          username: cleanUsername,
          email: cleanEmail,
          password: employeeForm.password,
        },
        {
          headers: getAuthHeaders(),
        }
      );

      setEmployeeForm({
        name: "",
        username: "",
        email: "",
        password: "",
      });

      setShowPassword(false);
      setShowAddForm(false);

      setSuccessMessage("Employee created successfully.");

      await fetchData();
    } catch (err: any) {
      console.error("Create employee error:", err);

      if (err.response?.status === 401) {
        handleLogout();
        return;
      }

      setFormError(
        err.response?.data?.detail ||
          "Unable to create employee. Please try again."
      );
    } finally {
      setCreating(false);
    }
  };

  // ---------------- EDIT EMPLOYEE ----------------

  const handleOpenEditForm = (employee: Employee) => {
    setEditingEmployee(employee);

    setEditEmployeeForm({
      name: employee.name,
      username: employee.username,
      email: employee.email,
    });

    setEditError("");
    setShowEditForm(true);
  };

  const handleEditFormChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;

    setEditEmployeeForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setEditError("");
  };

  const handleUpdateEmployee = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    if (!editingEmployee) return;

    const cleanName = editEmployeeForm.name.trim();
    const cleanUsername = editEmployeeForm.username.trim();
    const cleanEmail = editEmployeeForm.email.trim().toLowerCase();

    if (!cleanName || !cleanUsername || !cleanEmail) {
      setEditError("Please fill in all fields.");
      return;
    }

    if (!/^[a-zA-Z0-9_]{3,50}$/.test(cleanUsername)) {
      setEditError(
        "Username must contain 3–50 characters using letters, numbers or underscores."
      );
      return;
    }

    try {
      setSavingEdit(true);
      setEditError("");

      await api.put(
        `/admin/employees/${editingEmployee.id}`,
        {
          name: cleanName,
          username: cleanUsername,
          email: cleanEmail,
        },
        {
          headers: getAuthHeaders(),
        }
      );

      setShowEditForm(false);
      setEditingEmployee(null);

      setSuccessMessage("Employee details updated successfully.");

      await fetchData();
    } catch (err: any) {
      console.error("Update employee error:", err);

      if (err.response?.status === 401) {
        handleLogout();
        return;
      }

      setEditError(
        err.response?.data?.detail ||
          "Unable to update employee. Please try again."
      );
    } finally {
      setSavingEdit(false);
    }
  };

  // ---------------- ACTIVATE / DEACTIVATE ----------------

  const handleToggleEmployeeStatus = async (
    employee: Employee
  ) => {
    const nextStatus = !employee.is_active;
    const action = nextStatus ? "activate" : "deactivate";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} ${employee.name}'s account?`
    );

    if (!confirmed) return;

    setStatusError("");
    setSuccessMessage("");

    try {
      setUpdatingStatusId(employee.id);

      await api.patch(
        `/admin/employees/${employee.id}/status`,
        null,
        {
          params: { is_active: nextStatus },
          headers: getAuthHeaders(),
        }
      );

      setSuccessMessage(
        `${employee.name}'s account has been ${
          nextStatus ? "activated" : "deactivated"
        } successfully.`
      );

      await fetchData();
    } catch (err: any) {
      console.error("Update employee status error:", err);

      if (err.response?.status === 401) {
        handleLogout();
        return;
      }

      setStatusError(
        err.response?.data?.detail ||
          `Unable to ${action} employee account.`
      );
    } finally {
      setUpdatingStatusId(null);
    }
  };

  // ---------------- OPEN ARCHIVE / DELETE MODAL ----------------

  const handleOpenActionModal = (
    employee: Employee,
    action: EmployeeAction
  ) => {
    setSelectedEmployee(employee);
    setActionType(action);
    setReplacementEmployeeId("");
    setActionError("");
    setShowActionModal(true);
    setSuccessMessage("");
  };

  // ---------------- ARCHIVE / PERMANENT DELETE ----------------

  const handleEmployeeAction = async () => {
    if (!selectedEmployee) return;

    const unfinishedTasks = tasks.filter(
      (task) =>
        task.assigned_to === selectedEmployee.id &&
        task.status !== "completed"
    );

    if (unfinishedTasks.length > 0 && !replacementEmployeeId) {
      setActionError(
        "Select an active employee to receive the unfinished tasks."
      );
      return;
    }

    if (actionType === "permanent") {
      const confirmed = window.confirm(
        `PERMANENT DELETE WARNING\n\nAre you sure you want to permanently delete ${selectedEmployee.name}?\n\nThis action cannot be undone. Historical tasks will be preserved, but employee references will be removed.`
      );

      if (!confirmed) return;
    }

    try {
      setProcessingAction(true);
      setActionError("");

      const payload = {
        replacement_employee_id: replacementEmployeeId
          ? Number(replacementEmployeeId)
          : null,
      };

      let response;

      if (actionType === "archive") {
        response = await api.delete(
          `/admin/employees/${selectedEmployee.id}`,
          {
            data: payload,
            headers: getAuthHeaders(),
          }
        );
      } else {
        response = await api.delete(
          `/admin/employees/${selectedEmployee.id}/permanent`,
          {
            data: payload,
            headers: getAuthHeaders(),
          }
        );
      }

      const employeeName = selectedEmployee.name;

      setShowActionModal(false);
      setSelectedEmployee(null);
      setReplacementEmployeeId("");

      setSuccessMessage(
        response.data?.message ||
          `${employeeName} processed successfully.`
      );

      await fetchData();
    } catch (err: any) {
      console.error("Employee action error:", err);

      if (err.response?.status === 401) {
        handleLogout();
        return;
      }

      setActionError(
        err.response?.data?.detail ||
          `Unable to ${actionType} employee. Please try again.`
      );
    } finally {
      setProcessingAction(false);
    }
  };

  // ---------------- RESTORE EMPLOYEE ----------------

  const handleRestoreEmployee = async (employee: Employee) => {
    const confirmed = window.confirm(
      `Are you sure you want to restore ${employee.name}? The account will remain inactive until you activate it.`
    );

    if (!confirmed) return;

    try {
      setRestoringId(employee.id);
      setSuccessMessage("");

      await api.patch(
        `/admin/employees/${employee.id}/restore`,
        null,
        {
          headers: getAuthHeaders(),
        }
      );

      setSuccessMessage(
        `${employee.name} has been restored successfully. The account is currently inactive.`
      );

      setView("active");

      await fetchData();
    } catch (err: any) {
      console.error("Restore employee error:", err);

      if (err.response?.status === 401) {
        handleLogout();
        return;
      }

      setError(
        err.response?.data?.detail ||
          "Unable to restore employee."
      );
    } finally {
      setRestoringId(null);
    }
  };

  // ---------------- EMPLOYEE / TASK HELPERS ----------------

  const displayedEmployees =
    view === "active" ? employees : archivedEmployees;

  const filteredEmployees = displayedEmployees.filter((employee) => {
    const query = search.toLowerCase();

    return (
      employee.name.toLowerCase().includes(query) ||
      employee.email.toLowerCase().includes(query) ||
      employee.username.toLowerCase().includes(query)
    );
  });

  const getEmployeeTasks = (employeeId: number) => {
    return tasks.filter((task) => task.assigned_to === employeeId);
  };

  const activeEmployees = employees.filter(
    (employee) => employee.is_active
  ).length;

  const unfinishedTasksForSelectedEmployee = selectedEmployee
    ? tasks.filter(
        (task) =>
          task.assigned_to === selectedEmployee.id &&
          task.status !== "completed"
      )
    : [];

  // ---------------- MAIN UI ----------------

  return (
    <>
      <AdminSidebar name={name} onLogout={handleLogout} />

      <main className="min-h-screen bg-slate-50 px-4 pb-10 pt-20 sm:px-6 lg:ml-64 lg:px-8 lg:pt-10">
        <div className="mx-auto max-w-7xl">

          {/* HEADER */}

          <div className="mb-8">
            <p className="text-sm font-medium text-blue-600">
              Admin Workspace / Employees
            </p>

            <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                  Employee Directory
                </h1>

                <p className="mt-2 text-sm text-slate-500">
                  View and manage all registered employees.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={fetchData}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
                >
                  Refresh
                </button>

                <button
                  onClick={() => {
                    setShowAddForm(true);
                    setFormError("");
                    setSuccessMessage("");
                  }}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-blue-700"
                >
                  + Add Employee
                </button>
              </div>
            </div>
          </div>

          {/* SUCCESS MESSAGE */}

          {successMessage && (
            <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
              {successMessage}
            </div>
          )}

          {/* GENERAL ERROR */}

          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {statusError && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {statusError}
            </div>
          )}

          {/* STATISTICS */}

          <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">
                Total Employees
              </p>
              <h2 className="mt-3 text-3xl font-bold text-slate-900">
                {employees.length}
              </h2>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">
                Active Employees
              </p>
              <h2 className="mt-3 text-3xl font-bold text-green-600">
                {activeEmployees}
              </h2>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">
                Archived Employees
              </p>
              <h2 className="mt-3 text-3xl font-bold text-orange-600">
                {archivedEmployees.length}
              </h2>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">
                Total Tasks
              </p>
              <h2 className="mt-3 text-3xl font-bold text-blue-600">
                {tasks.length}
              </h2>
            </div>
          </div>

          {/* EMPLOYEE DIRECTORY */}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            {/* TABS AND SEARCH */}

            <div className="flex flex-col justify-between gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Employee Management
                </h2>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setView("active");
                      setSearch("");
                      setError("");
                    }}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                      view === "active"
                        ? "bg-blue-600 text-slate-900"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Active Employees ({employees.length})
                  </button>

                  <button
                    onClick={() => {
                      setView("archived");
                      setSearch("");
                      setError("");
                    }}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                      view === "archived"
                        ? "bg-orange-600 text-slate-900"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Archived Employees ({archivedEmployees.length})
                  </button>
                </div>
              </div>

              <input
                type="text"
                placeholder="Search by name, username or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 lg:max-w-xs"
              />
            </div>

            {/* EMPLOYEE TABLE */}

            {loading ? (
              <div className="p-12 text-center text-sm text-slate-500">
                Loading employee information...
              </div>
            ) : error ? (
              <div className="p-8 text-center text-sm text-red-600">
                {error}
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="p-12 text-center">
                <h3 className="font-semibold text-slate-800">
                  {view === "active"
                    ? "No employees found"
                    : "No archived employees found"}
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  {search
                    ? "Try another search term."
                    : view === "active"
                      ? "Add a new employee to get started."
                      : "Archived employees will appear here."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Employee
                      </th>

                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Email
                      </th>

                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Assigned Tasks
                      </th>

                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Completed
                      </th>

                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Status
                      </th>

                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {filteredEmployees.map((employee) => {
                      const employeeTasks = getEmployeeTasks(employee.id);

                      const completedTasks = employeeTasks.filter(
                        (task) => task.status === "completed"
                      ).length;

                      return (
                        <tr
                          key={employee.id}
                          className="transition hover:bg-blue-50"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700">
                                {employee.name.charAt(0).toUpperCase()}
                              </div>

                              <div>
                                <p className="font-semibold text-slate-800">
                                  {employee.name}
                                </p>

                                <p className="text-xs text-slate-400">
                                  @{employee.username} · ID: {employee.id}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4 text-sm text-slate-600">
                            {employee.email}
                          </td>

                          <td className="px-6 py-4">
                            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                              {employeeTasks.length}
                            </span>
                          </td>

                          <td className="px-6 py-4 text-sm font-medium text-green-600">
                            {completedTasks}
                          </td>

                          <td className="px-6 py-4">
                            {view === "archived" ? (
                              <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                                Archived
                              </span>
                            ) : (
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                  employee.is_active
                                    ? "bg-green-50 text-green-700"
                                    : "bg-red-50 text-red-700"
                                }`}
                              >
                                {employee.is_active ? "Active" : "Inactive"}
                              </span>
                            )}
                          </td>

                          {/* ACTIVE EMPLOYEE ACTIONS */}

                          <td className="px-6 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                              {view === "active" ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenEditForm(employee)
                                    }
                                    className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                                  >
                                    Edit
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleEmployeeStatus(employee)
                                    }
                                    disabled={
                                      updatingStatusId === employee.id
                                    }
                                    className={`rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
                                      employee.is_active
                                        ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                        : "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                                    }`}
                                  >
                                    {updatingStatusId === employee.id
                                      ? "Updating..."
                                      : employee.is_active
                                        ? "Deactivate"
                                        : "Activate"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenActionModal(
                                        employee,
                                        "archive"
                                      )
                                    }
                                    className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100"
                                  >
                                    Archive
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenActionModal(
                                        employee,
                                        "permanent"
                                      )
                                    }
                                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                                  >
                                    Delete
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRestoreEmployee(employee)
                                    }
                                    disabled={restoringId === employee.id}
                                    className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50"
                                  >
                                    {restoringId === employee.id
                                      ? "Restoring..."
                                      : "Restore"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenActionModal(
                                        employee,
                                        "permanent"
                                      )
                                    }
                                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                                  >
                                    Delete Permanently
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* ---------------- ADD EMPLOYEE MODAL ---------------- */}

      {showAddForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4">
          <div className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Add New Employee
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Create a new employee account.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                disabled={creating}
                className="rounded-lg px-3 py-2 text-xl text-slate-500 hover:bg-slate-100"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateEmployee} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Full Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={employeeForm.name}
                  onChange={handleFormChange}
                  placeholder="Enter employee full name"
                  maxLength={100}
                  required
                  disabled={creating}
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  value={employeeForm.username}
                  onChange={handleFormChange}
                  placeholder="Enter unique username"
                  minLength={3}
                  maxLength={50}
                  required
                  disabled={creating}
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  value={employeeForm.email}
                  onChange={handleFormChange}
                  placeholder="employee@example.com"
                  maxLength={150}
                  required
                  disabled={creating}
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Temporary Password
                </label>

                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={employeeForm.password}
                    onChange={handleFormChange}
                    placeholder="Enter temporary password"
                    minLength={8}
                    required
                    disabled={creating}
                    className="w-full rounded-lg border border-slate-200 px-4 py-3 pr-20 text-sm outline-none focus:border-blue-500"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-blue-600"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  disabled={creating}
                  className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? "Creating Employee..." : "Create Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- EDIT EMPLOYEE MODAL ---------------- */}

      {showEditForm && editingEmployee && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4">
          <div className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">
                Edit Employee
              </h2>

              <button
                type="button"
                onClick={() => {
                  setShowEditForm(false);
                  setEditingEmployee(null);
                }}
                disabled={savingEdit}
                className="rounded-lg px-3 py-2 text-xl text-slate-500 hover:bg-slate-100"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleUpdateEmployee} className="space-y-4">
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium uppercase text-slate-400">
                  Employee ID
                </p>
                <p className="mt-1 font-semibold text-slate-700">
                  #{editingEmployee.id}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Full Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={editEmployeeForm.name}
                  onChange={handleEditFormChange}
                  maxLength={100}
                  required
                  disabled={savingEdit}
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  value={editEmployeeForm.username}
                  onChange={handleEditFormChange}
                  minLength={3}
                  maxLength={50}
                  required
                  disabled={savingEdit}
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  value={editEmployeeForm.email}
                  onChange={handleEditFormChange}
                  maxLength={150}
                  required
                  disabled={savingEdit}
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                />
              </div>

              {editError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {editError}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditForm(false);
                    setEditingEmployee(null);
                  }}
                  disabled={savingEdit}
                  className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingEdit ? "Saving Changes..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- ARCHIVE / PERMANENT DELETE MODAL ---------------- */}

      {showActionModal && selectedEmployee && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4">
          <div className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">

            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">
                {actionType === "archive"
                  ? "Archive Employee"
                  : "Permanently Delete Employee"}
              </h2>

              <button
                type="button"
                onClick={() => {
                  if (!processingAction) {
                    setShowActionModal(false);
                    setSelectedEmployee(null);
                  }
                }}
                disabled={processingAction}
                className="rounded-lg px-3 py-2 text-xl text-slate-500 hover:bg-slate-100"
              >
                ×
              </button>
            </div>

            <div className="mb-5 rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase text-slate-400">
                Selected Employee
              </p>

              <p className="mt-1 font-semibold text-slate-900">
                {selectedEmployee.name}
              </p>

              <p className="text-sm text-slate-500">
                {selectedEmployee.email}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Employee ID: {selectedEmployee.id}
              </p>
            </div>

            {actionType === "archive" ? (
              <p className="mb-5 text-sm text-slate-600">
                Archiving will deactivate this employee and hide the account
                from the active employee directory. You can restore the
                employee later.
              </p>
            ) : (
              <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="font-semibold text-red-800">
                  Permanent deletion warning
                </p>
                <p className="mt-1 text-sm text-red-700">
                  This employee account will be physically removed from the
                  database. This operation cannot be undone. Historical tasks
                  will be retained, but references to this employee will be
                  cleared.
                </p>
              </div>
            )}

            <div className="mb-5">
              <p className="text-sm font-semibold text-slate-800">
                Unfinished tasks: {unfinishedTasksForSelectedEmployee.length}
              </p>

              {unfinishedTasksForSelectedEmployee.length > 0 ? (
                <>
                  <p className="mt-2 text-sm text-slate-600">
                    Select an active employee to receive these unfinished
                    tasks.
                  </p>

                  <select
                    value={replacementEmployeeId}
                    onChange={(e) =>
                      setReplacementEmployeeId(e.target.value)
                    }
                    disabled={processingAction}
                    className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="">
                      Select replacement employee
                    </option>

                    {employees
                      .filter(
                        (employee) =>
                          employee.id !== selectedEmployee.id &&
                          employee.is_active
                      )
                      .map((employee) => (
                        <option
                          key={employee.id}
                          value={employee.id}
                        >
                          {employee.name} ({employee.email})
                        </option>
                      ))}
                  </select>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  No unfinished tasks require reassignment.
                </p>
              )}
            </div>

            {actionError && (
              <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {actionError}
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowActionModal(false);
                  setSelectedEmployee(null);
                  setActionError("");
                }}
                disabled={processingAction}
                className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleEmployeeAction}
                disabled={processingAction}
                className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-slate-900 disabled:opacity-50 ${
                  actionType === "archive"
                    ? "bg-orange-600 hover:bg-orange-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {processingAction
                  ? "Processing..."
                  : actionType === "archive"
                    ? "Confirm Archive"
                    : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
