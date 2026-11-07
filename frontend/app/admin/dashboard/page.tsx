"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import AdminSidebar from "@/components/AdminSidebar";
import TaskAnalytics from "@/components/TaskAnalytics";
import useWebSocket, { WebSocketEvent } from "@/hooks/useWebSocket";

interface Task {
  id: number;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  assigned_to: number;
  created_by: number;
  created_at: string;
  verification_status: "not_submitted" | "pending" | "verified" | "rejected";
  completed_at: string | null;
  verified_at: string | null;
  verified_by: number | null;
  rejection_reason: string | null;
}

interface Notification {
  id: number;
  user_id: number;
  task_id: number | null;
  message: string;
  notification_type: string;
  is_read: boolean;
  created_at: string;
}

interface Employee {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function AdminDashboard() {
  const router = useRouter();

  // Task creation states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [success, setSuccess] = useState("");

  // Search and filter states
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [filteredTasks, setFilteredTasks] = useState<Task[] | null>(null);

  // Dashboard states
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterLoading, setFilterLoading] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);

  // Task verification and notification states
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationToast, setNotificationToast] = useState("");
  const [rejectingTaskId, setRejectingTaskId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [verificationLoadingId, setVerificationLoadingId] = useState<number | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null);

  const knownNotificationIds = useRef<Set<number>>(new Set());
  const notificationInitialised = useRef(false);

  // Fetch dashboard data
  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    const role = sessionStorage.getItem("role");

    if (!token || role !== "admin") {
      router.replace("/login");
      return;
    }

    const fetchDashboard = async () => {
      try {
        const headers = {
          Authorization: `Bearer ${token}`,
        };

        const [
          profileResponse,
          tasksResponse,
          employeesResponse,
        ] = await Promise.all([
          api.get("/me", { headers }),
          api.get("/tasks/", { headers }),
          api.get("/employees/", { headers }),
        ]);

        setName(profileResponse.data.name);
        setTasks(tasksResponse.data);
        setEmployees(employeesResponse.data);
      } catch (err: any) {
        if (
          err.response?.status === 401 ||
          err.response?.status === 403
        ) {
          sessionStorage.removeItem("access_token");
          sessionStorage.removeItem("role");
          router.replace("/login");
          return;
        }

        setError(
          err.response?.data?.detail ||
            "Unable to load admin dashboard."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [router]);

  // Fetch the latest task list after a WebSocket reconnect.
  const fetchAdminTasks = useCallback(async () => {
    const token = sessionStorage.getItem("access_token");

    if (!token) return;

    try {
      const response = await api.get("/tasks/", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (Array.isArray(response.data)) {
        setTasks(response.data);
        setFilteredTasks(null);
      }
    } catch (err) {
      console.error("Unable to synchronize admin tasks:", err);
    }
  }, []);

  // Fetch notifications when an event arrives or the socket reconnects.
  const fetchAdminNotifications = useCallback(async (showToast = false) => {
    const token = sessionStorage.getItem("access_token");

    if (!token) return;

    try {
      const response = await api.get("/tasks/notifications", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!Array.isArray(response.data)) return;

      const incoming: Notification[] = response.data;

      if (showToast && notificationInitialised.current) {
        const fresh = incoming.filter(
          (item) => !knownNotificationIds.current.has(item.id)
        );

        if (fresh.length > 0) {
          setNotificationToast(fresh[0].message);
          window.setTimeout(() => setNotificationToast(""), 6000);
        }
      }

      incoming.forEach((item) => {
        knownNotificationIds.current.add(item.id);
      });

      notificationInitialised.current = true;
      setNotifications(incoming);
    } catch (err) {
      console.error("Unable to synchronize admin notifications:", err);
    }
  }, []);

  // Handle real-time task and notification events from FastAPI.
  const handleWebSocketMessage = useCallback(
    (event: WebSocketEvent) => {
      console.log("Admin WebSocket event:", event.type);

      switch (event.type) {
        case "task_created":
        case "task_updated":
        case "task_status_updated":
        case "task_submitted":
        case "task_resubmitted":
        case "task_verified":
        case "task_rejected": {
          if (!event.task) {
            fetchAdminTasks();
            break;
          }

          const updatedTask = event.task as Task;

          setTasks((current) => {
            const exists = current.some(
              (task) => task.id === updatedTask.id
            );

            return exists
              ? current.map((task) =>
                  task.id === updatedTask.id ? updatedTask : task
                )
              : [updatedTask, ...current];
          });

          setFilteredTasks((current) => {
            if (current === null) return null;

            const exists = current.some(
              (task) => task.id === updatedTask.id
            );

            return exists
              ? current.map((task) =>
                  task.id === updatedTask.id ? updatedTask : task
                )
              : [updatedTask, ...current];
          });

          if (
            event.type === "task_submitted" ||
            event.type === "task_resubmitted"
          ) {
            fetchAdminNotifications(true);
          }

          break;
        }

        case "task_deleted": {
          if (event.task_id == null) {
            fetchAdminTasks();
            break;
          }

          setTasks((current) =>
            current.filter((task) => task.id !== event.task_id)
          );

          setFilteredTasks((current) =>
            current === null
              ? null
              : current.filter(
                  (task) => task.id !== event.task_id
                )
          );

          break;
        }

        case "notification_updated":
        case "notification_created":
        case "new_notification":
          fetchAdminNotifications(true);
          break;

        default:
          console.debug(
            "Unhandled admin WebSocket event:",
            event.type
          );
      }
    },
    [fetchAdminTasks, fetchAdminNotifications]
  );

  // Refresh data if the WebSocket reconnects.
  const handleWebSocketReconnect = useCallback(() => {
    console.log(
      "Admin WebSocket reconnected; refreshing dashboard data."
    );

    fetchAdminTasks();
    fetchAdminNotifications(false);
  }, [fetchAdminTasks, fetchAdminNotifications]);

  // Establish the admin's authenticated WebSocket connection.
  useWebSocket({
    onMessage: handleWebSocketMessage,
    onReconnect: handleWebSocketReconnect,
  });

  // Load notifications once when the dashboard mounts.
  useEffect(() => {
    if (sessionStorage.getItem("role") !== "admin") return;

    fetchAdminNotifications(false);
  }, [fetchAdminNotifications]);

  // Search and filter tasks
  const handleFilterTasks = async () => {
    const token = sessionStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      setError("");
      setFilterLoading(true);

      const params: {
        search?: string;
        status?: string;
        priority?: string;
        assigned_to?: number;
      } = {};

      if (search.trim()) {
        params.search = search.trim();
      }

      if (statusFilter) {
        params.status = statusFilter;
      }

      if (priorityFilter) {
        params.priority = priorityFilter;
      }

      if (employeeFilter) {
        params.assigned_to = Number(employeeFilter);
      }

      const response = await api.get("/tasks/filter", {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setFilteredTasks(response.data);
    } catch (err: any) {
      if (
        err.response?.status === 401 ||
        err.response?.status === 403
      ) {
        sessionStorage.removeItem("access_token");
        sessionStorage.removeItem("role");
        router.replace("/login");
        return;
      }

      setError(
        err.response?.data?.detail ||
          "Unable to filter tasks."
      );
    } finally {
      setFilterLoading(false);
    }
  };

  // Clear filters
  const handleClearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setPriorityFilter("");
    setEmployeeFilter("");
    setFilteredTasks(null);
    setError("");
  };

  // Create and assign task
  const handleCreateTask = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    const token = sessionStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      setError("");
      setSuccess("");
      setCreatingTask(true);

      const response = await api.post(
        "/tasks/",
        {
          title,
          description,
          priority,
          assigned_to: Number(assignedTo),
          due_date: dueDate
            ? new Date(dueDate).toISOString()
            : null,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setTasks((previousTasks) => [
        response.data,
        ...previousTasks,
      ]);

      // Reset filters so the new task is visible.
      setFilteredTasks(null);
      setSearch("");
      setStatusFilter("");
      setPriorityFilter("");
      setEmployeeFilter("");

      // Reset form.
      setTitle("");
      setDescription("");
      setPriority("medium");
      setAssignedTo("");
      setDueDate("");

      setSuccess("Task created and assigned successfully!");
    } catch (err: any) {
      if (
        err.response?.status === 401 ||
        err.response?.status === 403
      ) {
        sessionStorage.removeItem("access_token");
        sessionStorage.removeItem("role");
        router.replace("/login");
        return;
      }

      setError(
        err.response?.data?.detail ||
          "Unable to create task."
      );
    } finally {
      setCreatingTask(false);
    }
  };

  // Refresh tasks after a verification or deletion action.
  const refreshTasks = async () => {
    const token = sessionStorage.getItem("access_token");

    if (!token) return;

    const response = await api.get("/tasks/", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    setTasks(response.data);
    setFilteredTasks(null);
  };

  // Approve or reject an employee's submitted task.
  const handleVerifyTask = async (
    taskId: number,
    action: "approve" | "reject"
  ) => {
    const token = sessionStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    if (action === "reject" && !rejectionReason.trim()) {
      setError("Please provide a rejection reason.");
      return;
    }

    try {
      setError("");
      setSuccess("");
      setVerificationLoadingId(taskId);

      await api.patch(
        `/tasks/${taskId}/verify`,
        {
          action,
          rejection_reason:
            action === "reject"
              ? rejectionReason.trim()
              : null,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      await refreshTasks();

      setRejectingTaskId(null);
      setRejectionReason("");

      setSuccess(
        action === "approve"
          ? "Task approved and verified successfully."
          : "Task rejected. The employee can now review the reason and resubmit."
      );
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Unable to update task verification."
      );
    } finally {
      setVerificationLoadingId(null);
    }
  };

  // Delete a verified task.
  const handleDeleteVerifiedTask = async (taskId: number) => {
    const token = sessionStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    if (
      !window.confirm(
        "Permanently delete this verified task? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      setError("");
      setSuccess("");
      setDeletingTaskId(taskId);

      await api.delete(`/tasks/${taskId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setTasks((current) =>
        current.filter((task) => task.id !== taskId)
      );

      setFilteredTasks((current) =>
        current === null
          ? null
          : current.filter((task) => task.id !== taskId)
      );

      setSuccess("Verified task permanently deleted.");
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Unable to delete this task."
      );
    } finally {
      setDeletingTaskId(null);
    }
  };

  // Mark a notification as read.
  const handleNotificationClick = async (
    notification: Notification
  ) => {
    const token = sessionStorage.getItem("access_token");

    if (!token) return;

    try {
      if (!notification.is_read) {
        await api.patch(
          `/tasks/notifications/${notification.id}/read`,
          { is_read: true },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id
              ? { ...item, is_read: true }
              : item
          )
        );
      }

      setShowNotifications(false);

      if (notification.task_id !== null) {
        document
          .getElementById("pending-verification")
          ?.scrollIntoView({ behavior: "smooth" });
      }
    } catch (err) {
      setError("Unable to mark notification as read.");
    }
  };

  // Logout
  const handleLogout = () => {
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("role");
    router.replace("/login");
  };

  // Displayed tasks
  const displayedTasks = filteredTasks ?? tasks;

  // Formatting helpers
  const formatLabel = (value: string) =>
    value.replace("_", " ").replace(/\b\w/g, (char) =>
      char.toUpperCase()
    );

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-700";
      case "in_progress":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-yellow-100 text-yellow-700";
    }
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-700";
      case "medium":
        return "bg-orange-100 text-orange-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  // Task statistics
  const pendingTasks = tasks.filter(
    (task) => task.status === "pending"
  ).length;

  const inProgressTasks = tasks.filter(
    (task) => task.status === "in_progress"
  ).length;

  const completedTasks = tasks.filter(
    (task) => task.status === "completed"
  ).length;

  const tasksAwaitingVerification = tasks.filter(
    (task) => task.verification_status === "pending"
  );

  const unreadNotifications = notifications.filter(
    (item) => !item.is_read
  ).length;

  const getVerificationStyle = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-amber-100 text-amber-800";
      case "verified":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  // Loading screen
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center overflow-x-hidden bg-slate-50">
        <div className="rounded-xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="font-medium text-gray-700">
            Loading admin dashboard...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      id="overview"
      className="min-h-screen w-full overflow-x-hidden bg-slate-50 px-3 pb-5 pt-20 sm:px-6 lg:pb-6 lg:pl-72 lg:pt-6 lg:pr-10"
    >
      {/* Admin Sidebar */}
      <AdminSidebar
        name={name}
        onLogout={handleLogout}
      />

      <div className="mx-auto w-full max-w-7xl min-w-0">

        {/* Header */}
        <header className="mb-8 flex min-w-0 flex-col gap-5 rounded-2xl bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-blue-600">
              Management Workspace
            </p>

            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              Admin Dashboard
            </h1>

            <p className="mt-2 break-words text-gray-500">
              Welcome back, {name}. Manage your employees and tasks.
            </p>
          </div>

          <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setShowNotifications((value) => !value)
                }
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
              >
                Notifications

                {unreadNotifications > 0 && (
                  <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                    {unreadNotifications}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 z-30 mt-2 max-h-80 w-[min(90vw,360px)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">
                      Notifications
                    </h3>

                    <button
                      type="button"
                      onClick={() => setShowNotifications(false)}
                      className="text-sm text-gray-500 hover:text-gray-800"
                    >
                      Close
                    </button>
                  </div>

                  {notifications.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500">
                      No notifications yet.
                    </p>
                  ) : (
                    notifications.slice(0, 20).map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() =>
                          handleNotificationClick(notification)
                        }
                        className={`mb-2 block w-full rounded-lg p-3 text-left text-sm hover:bg-slate-50 ${
                          notification.is_read
                            ? "bg-white text-gray-500"
                            : "bg-blue-50 text-gray-800"
                        }`}
                      >
                        <span>{notification.message}</span>

                        <span className="mt-1 block text-xs text-gray-400">
                          {new Date(
                            notification.created_at
                          ).toLocaleString()}{" "}
                          {notification.is_read ? "· Read" : "· New"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleLogout}
              className="w-full rounded-lg bg-red-600 px-5 py-3 font-medium text-white transition hover:bg-red-700 sm:w-auto"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Error Message */}
        {error && (
          <div
            role="alert"
            className="mb-6 break-words rounded-xl border border-red-200 bg-red-50 p-4 text-red-700"
          >
            {error}
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div
            role="status"
            className="mb-6 break-words rounded-xl border border-green-200 bg-green-50 p-4 text-green-700"
          >
            {success}
          </div>
        )}

        {/* Notification Toast */}
        {notificationToast && (
          <div
            role="status"
            className="fixed right-4 top-4 z-50 max-w-sm rounded-xl border border-blue-200 bg-white p-4 text-sm text-gray-800 shadow-xl"
          >
            <p className="font-semibold text-blue-700">
              New task submission
            </p>

            <p className="mt-1">{notificationToast}</p>

            <button
              type="button"
              onClick={() => setNotificationToast("")}
              className="mt-2 text-xs font-semibold text-blue-700"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Statistics */}
        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

          <div className="min-w-0 rounded-xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-sm font-medium text-gray-500">
              Total Tasks
            </p>

            <h2 className="mt-3 text-3xl font-bold text-gray-900">
              {tasks.length}
            </h2>

            <p className="mt-2 text-sm text-gray-400">
              All created tasks
            </p>
          </div>

          <div className="min-w-0 rounded-xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-sm font-medium text-gray-500">
              Pending Tasks
            </p>

            <h2 className="mt-3 text-3xl font-bold text-yellow-600">
              {pendingTasks}
            </h2>

            <p className="mt-2 text-sm text-gray-400">
              Waiting to be started
            </p>
          </div>

          <div className="min-w-0 rounded-xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-sm font-medium text-gray-500">
              In Progress
            </p>

            <h2 className="mt-3 text-3xl font-bold text-blue-600">
              {inProgressTasks}
            </h2>

            <p className="mt-2 text-sm text-gray-400">
              Currently in progress
            </p>
          </div>

          <div className="min-w-0 rounded-xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-sm font-medium text-gray-500">
              Completed Tasks
            </p>

            <h2 className="mt-3 text-3xl font-bold text-green-600">
              {completedTasks}
            </h2>

            <p className="mt-2 text-sm text-gray-400">
              Successfully completed
            </p>
          </div>

        </section>

        {/* Task Analytics */}
        <section id="analytics" className="scroll-mt-20">
          <TaskAnalytics tasks={tasks} />
        </section>

        {/* Tasks waiting for admin verification */}
        <section
          id="pending-verification"
          className="mb-8 scroll-mt-20 rounded-2xl border border-amber-200 bg-white p-4 shadow-sm sm:p-6"
        >
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Pending Verification
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Review tasks submitted by employees before marking them as verified.
              </p>
            </div>

            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-800">
              {tasksAwaitingVerification.length} awaiting review
            </span>
          </div>

          {tasksAwaitingVerification.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
              There are no tasks waiting for verification.
            </div>
          ) : (
            <div className="space-y-4">
              {tasksAwaitingVerification.map((task) => {
                const employee = employees.find(
                  (item) => item.id === task.assigned_to
                );

                return (
                  <article
                    key={task.id}
                    className="rounded-xl border border-gray-200 p-4 sm:p-5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-gray-900">
                            {task.title}
                          </h3>

                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                            Awaiting verification
                          </span>
                        </div>

                        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
                          {task.description || "No description provided."}
                        </p>

                        <p className="mt-3 text-sm text-gray-500">
                          Submitted by:{" "}
                          <span className="font-medium text-gray-800">
                            {employee?.name ||
                              `Employee ID: ${task.assigned_to}`}
                          </span>
                        </p>

                        {task.completed_at && (
                          <p className="mt-1 text-xs text-gray-400">
                            Submitted:{" "}
                            {new Date(
                              task.completed_at
                            ).toLocaleString()}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <button
                          type="button"
                          disabled={verificationLoadingId === task.id}
                          onClick={() =>
                            handleVerifyTask(task.id, "approve")
                          }
                          className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                        >
                          {verificationLoadingId === task.id
                            ? "Processing..."
                            : "Approve"}
                        </button>

                        <button
                          type="button"
                          disabled={verificationLoadingId === task.id}
                          onClick={() => {
                            setRejectingTaskId(task.id);
                            setRejectionReason("");
                            setError("");
                          }}
                          className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    </div>

                    {rejectingTaskId === task.id && (
                      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                        <label className="mb-2 block text-sm font-semibold text-gray-800">
                          Reason for rejection
                        </label>

                        <textarea
                          value={rejectionReason}
                          onChange={(event) =>
                            setRejectionReason(event.target.value)
                          }
                          rows={3}
                          maxLength={1000}
                          placeholder="Explain what needs to be corrected..."
                          className="w-full rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                        />

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={
                              verificationLoadingId === task.id ||
                              !rejectionReason.trim()
                            }
                            onClick={() =>
                              handleVerifyTask(task.id, "reject")
                            }
                            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {verificationLoadingId === task.id
                              ? "Submitting..."
                              : "Confirm Rejection"}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setRejectingTaskId(null);
                              setRejectionReason("");
                            }}
                            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Create New Task */}
        <section className="mb-8 w-full min-w-0 overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6 md:p-7">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              Create New Task
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Assign a new task to an active employee.
            </p>
          </div>

          <form
            onSubmit={handleCreateTask}
            className="grid w-full min-w-0 grid-cols-1 gap-5 md:grid-cols-2"
            style={{
              width: "100%",
              minWidth: 0,
              boxSizing: "border-box",
            }}
          >
            {/* Task Title */}
            <div className="w-full min-w-0">
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Task Title
              </label>

              <input
                type="text"
                placeholder="Enter task title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  minWidth: 0,
                  boxSizing: "border-box",
                }}
                className="rounded-lg border border-gray-200 bg-white p-3 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* Employee Dropdown */}
            <div className="w-full min-w-0">
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Assign Employee
              </label>

              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                required
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  minWidth: 0,
                  boxSizing: "border-box",
                }}
                className="rounded-lg border border-gray-200 bg-white p-3 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Select Employee</option>

                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} ({employee.email})
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div className="w-full min-w-0 md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Task Description
              </label>

              <textarea
                placeholder="Enter task details..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  minWidth: 0,
                  boxSizing: "border-box",
                }}
                className="resize-y rounded-lg border border-gray-200 bg-white p-3 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* Priority */}
            <div className="w-full min-w-0">
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Priority
              </label>

              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  minWidth: 0,
                  boxSizing: "border-box",
                }}
                className="rounded-lg border border-gray-200 bg-white p-3 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
              </select>
            </div>

            {/* Due Date */}
            <div className="w-full min-w-0">
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Due Date
              </label>

              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  minWidth: 0,
                  boxSizing: "border-box",
                }}
                className="rounded-lg border border-gray-200 bg-white p-3 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={employees.length === 0 || creatingTask}
              className="w-full min-w-0 rounded-lg bg-blue-600 p-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400 md:col-span-2"
            >
              {creatingTask
                ? "Creating Task..."
                : "Create and Assign Task"}
            </button>
          </form>

          {employees.length === 0 && (
            <p className="mt-4 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-700">
              No active employees are currently available for assignment.
            </p>
          )}
        </section>

        {/* All Tasks */}
        <section
          id="tasks"
          className="min-w-0 scroll-mt-20 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6 md:p-7"
        >
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              All Tasks
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Search, filter and manage assigned tasks.
            </p>
          </div>

          {/* Search and Filters */}
          <div className="mb-5 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

            <div className="min-w-0">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Search by Title
              </label>

              <input
                type="text"
                placeholder="Search tasks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="box-border block w-full min-w-0 max-w-full rounded-lg border border-gray-200 p-3 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="min-w-0">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Status
              </label>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="box-border block w-full min-w-0 max-w-full rounded-lg border border-gray-200 bg-white p-3 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div className="min-w-0">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Priority
              </label>

              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="box-border block w-full min-w-0 max-w-full rounded-lg border border-gray-200 bg-white p-3 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">All Priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div className="min-w-0">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Employee
              </label>

              <select
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
                className="box-border block w-full min-w-0 max-w-full rounded-lg border border-gray-200 bg-white p-3 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">All Employees</option>

                {employees.map((employee) => (
                  <option
                    key={employee.id}
                    value={employee.id}
                  >
                    {employee.name}
                  </option>
                ))}
              </select>
            </div>

          </div>

          {/* Filter Buttons */}
          <div className="mb-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleFilterTasks}
              disabled={filterLoading}
              className="w-full rounded-lg bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
            >
              {filterLoading ? "Applying..." : "Apply Filters"}
            </button>

            <button
              type="button"
              onClick={handleClearFilters}
              className="w-full rounded-lg border border-gray-200 bg-white px-5 py-3 font-medium text-gray-700 transition hover:bg-gray-100 sm:w-auto"
            >
              Clear Filters
            </button>
          </div>

          {/* Result Count */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5">
            <p className="text-sm text-gray-500">
              Showing{" "}
              <span className="font-semibold text-gray-900">
                {displayedTasks.length}
              </span>{" "}
              {filteredTasks !== null ? "filtered" : "total"} tasks
            </p>
          </div>

          {/* Tasks Table */}
          {displayedTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-12 text-center">
              <h3 className="font-semibold text-gray-700">
                {filteredTasks !== null
                  ? "No matching tasks found"
                  : "No tasks available"}
              </h3>

              <p className="mt-2 text-sm text-gray-500">
                {filteredTasks !== null
                  ? "Try changing your search or filter options."
                  : "Create a new task to get started."}
              </p>
            </div>
          ) : (
            <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full min-w-[1050px] text-left">
                <thead className="bg-slate-50">
                  <tr className="text-sm text-gray-600">
                    <th className="p-4 font-semibold">Task ID</th>
                    <th className="p-4 font-semibold">Title</th>
                    <th className="p-4 font-semibold">Priority</th>
                    <th className="p-4 font-semibold">Status</th>
                    <th className="p-4 font-semibold">Assigned Employee</th>
                    <th className="p-4 font-semibold">Due Date</th>
                    <th className="p-4 font-semibold">Verification</th>
                    <th className="p-4 font-semibold">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {displayedTasks.map((task) => {
                    const employee = employees.find(
                      (item) => item.id === task.assigned_to
                    );

                    return (
                      <tr
                        key={task.id}
                        className="border-t border-gray-100 text-sm text-gray-700 transition hover:bg-slate-50"
                      >
                        <td className="p-4 font-medium text-gray-500">
                          #{task.id}
                        </td>

                        <td className="p-4">
                          <p className="font-semibold text-gray-900">
                            {task.title}
                          </p>

                          <p className="mt-1 max-w-xs truncate text-xs text-gray-400">
                            {task.description || "No description"}
                          </p>
                        </td>

                        <td className="p-4">
                          <span
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getPriorityStyle(
                              task.priority
                            )}`}
                          >
                            {formatLabel(task.priority)}
                          </span>
                        </td>

                        <td className="p-4">
                          <span
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getStatusStyle(
                              task.status
                            )}`}
                          >
                            {formatLabel(task.status)}
                          </span>
                        </td>

                        <td className="p-4">
                          {employee ? (
                            <div>
                              <p className="font-medium text-gray-800">
                                {employee.name}
                              </p>

                              <p className="mt-1 text-xs text-gray-400">
                                {employee.email}
                              </p>
                            </div>
                          ) : (
                            `Employee ID: ${task.assigned_to}`
                          )}
                        </td>

                        <td className="p-4 text-gray-500">
                          {task.due_date
                            ? new Date(
                                task.due_date
                              ).toLocaleDateString()
                            : "Not set"}
                        </td>

                        <td className="p-4">
                          <span
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getVerificationStyle(
                              task.verification_status || "not_submitted"
                            )}`}
                          >
                            {formatLabel(
                              task.verification_status || "not_submitted"
                            )}
                          </span>

                          {task.rejection_reason &&
                            task.verification_status === "rejected" && (
                              <p className="mt-2 max-w-xs whitespace-normal text-xs text-red-600">
                                Reason: {task.rejection_reason}
                              </p>
                            )}
                        </td>

                        <td className="p-4">
                          {task.verification_status === "verified" ? (
                            <button
                              type="button"
                              disabled={deletingTaskId === task.id}
                              onClick={() =>
                                handleDeleteVerifiedTask(task.id)
                              }
                              className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                            >
                              {deletingTaskId === task.id
                                ? "Deleting..."
                                : "Delete"}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">
                              Available after verification
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </section>

        {/* Footer */}
        <footer className="py-6 text-center text-sm text-gray-400">
          Admin Task Management Workspace
        </footer>

      </div>
    </main>
  );
}