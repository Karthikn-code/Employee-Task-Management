
"use client";

import EmployeeSidebar from "@/components/EmployeeSidebar";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import useWebSocket, {
  WebSocketEvent,
} from "@/hooks/useWebSocket";

interface Task {
  id: number;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  assigned_to: number | null;
  created_by: number | null;
  created_at: string;

  verification_status: string;
  completed_at: string | null;
  verified_at: string | null;
  verified_by: number | null;
  rejection_reason: string | null;
}

export default function EmployeeDashboard() {
  const router = useRouter();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingTaskId, setUpdatingTaskId] =
    useState<number | null>(null);

  // --------------------------------------------------
  // AUTHENTICATION ERROR HANDLING
  // --------------------------------------------------

  const handleAuthenticationError = useCallback(
    (err: any): boolean => {
      if (err.response?.status === 401) {
        sessionStorage.removeItem("access_token");
        sessionStorage.removeItem("role");
        router.replace("/login");
        return true;
      }

      return false;
    },
    [router]
  );

  // --------------------------------------------------
  // FETCH EMPLOYEE TASKS
  // --------------------------------------------------

  const fetchTasks = useCallback(async () => {
    const token = sessionStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      const response = await api.get("/tasks/my-tasks", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setTasks(response.data);
    } catch (err: any) {
      if (handleAuthenticationError(err)) return;

      setError(
        err.response?.data?.detail ||
          "Unable to refresh employee tasks."
      );

      console.error("Unable to refresh employee tasks:", err);
    }
  }, [handleAuthenticationError, router]);

  // --------------------------------------------------
  // HANDLE WEBSOCKET EVENTS
  // --------------------------------------------------

  const handleWebSocketMessage = useCallback(
    (event: WebSocketEvent) => {
      console.log("Employee WebSocket event:", event.type);

      switch (event.type) {
        case "task_created":
        case "task_updated":
        case "task_submitted":
        case "task_resubmitted":
        case "task_verified":
        case "task_rejected": {
          if (!event.task) return;

          const updatedTask = event.task as Task;

          setTasks((previousTasks) => {
            const exists = previousTasks.some(
              (task) => task.id === updatedTask.id
            );

            if (exists) {
              return previousTasks.map((task) =>
                task.id === updatedTask.id
                  ? updatedTask
                  : task
              );
            }

            return [updatedTask, ...previousTasks];
          });

          break;
        }

        case "task_deleted": {
          if (event.task_id == null) return;

          setTasks((previousTasks) =>
            previousTasks.filter(
              (task) => task.id !== event.task_id
            )
          );

          break;
        }

        case "notification_updated": {
          console.log("Employee notification updated.");
          break;
        }

        default:
          console.log(
            "Unhandled WebSocket event:",
            event.type
          );
      }
    },
    []
  );

  // --------------------------------------------------
  // WEBSOCKET RECONNECTION
  // --------------------------------------------------

  const handleWebSocketReconnect = useCallback(() => {
    console.log(
      "WebSocket reconnected. Refreshing employee tasks..."
    );

    fetchTasks();
  }, [fetchTasks]);

  useWebSocket({
    onMessage: handleWebSocketMessage,
    onReconnect: handleWebSocketReconnect,
  });

  // --------------------------------------------------
  // INITIAL DASHBOARD LOAD
  // --------------------------------------------------

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    const role = sessionStorage.getItem("role");

    if (!token || role !== "employee") {
      router.replace("/login");
      return;
    }

    let isMounted = true;

    const fetchDashboard = async () => {
      try {
        const headers = {
          Authorization: `Bearer ${token}`,
        };

        const [profileResponse, tasksResponse] =
          await Promise.all([
            api.get("/me", { headers }),
            api.get("/tasks/my-tasks", { headers }),
          ]);

        if (!isMounted) return;

        setName(profileResponse.data.name);
        setTasks(tasksResponse.data);
      } catch (err: any) {
        if (!isMounted) return;

        if (handleAuthenticationError(err)) return;

        setError(
          err.response?.data?.detail ||
            "Unable to load your dashboard."
        );
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchDashboard();

    return () => {
      isMounted = false;
    };
  }, [router, handleAuthenticationError]);

  // --------------------------------------------------
  // UPDATE TASK STATUS / SUBMIT FOR VERIFICATION
  // --------------------------------------------------

  const updateTaskStatus = async (
    taskId: number,
    status: string
  ) => {
    const token = sessionStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    if (updatingTaskId !== null) return;

    try {
      setError("");
      setUpdatingTaskId(taskId);

      const response = await api.patch(
        `/tasks/${taskId}/status`,
        { status },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // Immediately update the employee dashboard.
      setTasks((previousTasks) =>
        previousTasks.map((task) =>
          task.id === taskId ? response.data : task
        )
      );

      console.log(
        `Task ${taskId} successfully updated to ${status}`
      );
    } catch (err: any) {
      if (handleAuthenticationError(err)) return;

      if (err.response?.status === 403) {
        setError(
          err.response?.data?.detail ||
            "You do not have permission to update this task."
        );
        return;
      }

      setError(
        err.response?.data?.detail ||
          "Unable to update task status. Please try again."
      );

      console.error("Task update failed:", err);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  // --------------------------------------------------
  // LOGOUT
  // --------------------------------------------------

  const handleLogout = () => {
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("role");

    router.replace("/login");
  };

  // --------------------------------------------------
  // TASK STATUS STYLING
  // --------------------------------------------------

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

  // --------------------------------------------------
  // VERIFICATION STATUS STYLING
  // --------------------------------------------------

  const getVerificationStyle = (status: string) => {
    switch (status) {
      case "verified":
        return "bg-green-100 text-green-700";

      case "pending":
        return "bg-amber-100 text-amber-700";

      case "rejected":
        return "bg-red-100 text-red-700";

      default:
        return "bg-slate-100 text-slate-600";
    }
  };

  // --------------------------------------------------
  // PRIORITY STYLING
  // --------------------------------------------------

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

  // --------------------------------------------------
  // FORMAT LABELS
  // --------------------------------------------------

  const formatLabel = (value: string) =>
    value.replace("_", " ").replace(/\b\w/g, (char) =>
      char.toUpperCase()
    );

  // --------------------------------------------------
  // TASK STATISTICS
  // --------------------------------------------------

  const totalTasks = tasks.length;

  const pendingTasks = tasks.filter(
    (task) => task.status === "pending"
  ).length;

  const inProgressTasks = tasks.filter(
    (task) => task.status === "in_progress"
  ).length;

  const completedTasks = tasks.filter(
    (task) => task.status === "completed"
  ).length;

  const verifiedTasks = tasks.filter(
    (task) => task.verification_status === "verified"
  ).length;

  // --------------------------------------------------
  // LOADING SCREEN
  // --------------------------------------------------

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>

          <p className="font-medium text-gray-700">
            Loading your dashboard...
          </p>
        </div>
      </main>
    );
  }

  // --------------------------------------------------
  // EMPLOYEE DASHBOARD UI
  // --------------------------------------------------

  return (
    <main
      id="overview"
      className="min-h-screen w-full overflow-x-hidden bg-slate-50 px-3 pb-6 pt-20 sm:px-6 lg:pb-6 lg:pl-72 lg:pt-6 lg:pr-10"
    >
      <EmployeeSidebar
        name={name}
        onLogout={handleLogout}
      />

      <div className="mx-auto w-full max-w-7xl min-w-0">

        {/* Dashboard Header */}

        <header className="mb-8 flex min-w-0 flex-col gap-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-blue-600">
              Employee Workspace
            </p>

            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              Employee Dashboard
            </h1>

            <p className="mt-2 break-words text-gray-500">
              Welcome back, {name}. Here are your assigned tasks.
            </p>
          </div>

          <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
            Employee Workspace
          </div>
        </header>

        {/* Error Message */}

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700"
          >
            {error}
          </div>
        )}

        {/* Dashboard Statistics */}

        <section className="mb-8 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

          <div className="min-w-0 rounded-xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-sm font-medium text-gray-500">
              Total Tasks
            </p>

            <h2 className="mt-3 text-3xl font-bold text-gray-900">
              {totalTasks}
            </h2>

            <p className="mt-2 text-sm text-gray-400">
              All assigned tasks
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
              Currently being worked on
            </p>
          </div>

          <div className="min-w-0 rounded-xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-sm font-medium text-gray-500">
              Verified Tasks
            </p>

            <h2 className="mt-3 text-3xl font-bold text-green-600">
              {verifiedTasks}
            </h2>

            <p className="mt-2 text-sm text-gray-400">
              Approved by admin
            </p>
          </div>

        </section>

        {/* Assigned Tasks */}

        <section
          id="my-tasks"
          className="scroll-mt-20 min-w-0 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6 md:p-7"
        >
          <div className="mb-6 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                My Assigned Tasks
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                View your tasks and track their verification progress.
              </p>
            </div>

            <span className="w-fit rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
              {totalTasks} Tasks
            </span>
          </div>

          {tasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-12 text-center">
              <h3 className="text-lg font-semibold text-gray-700">
                No tasks assigned yet
              </h3>

              <p className="mt-2 text-sm text-gray-500">
                Your assigned tasks will appear here.
              </p>
            </div>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-2">

              {tasks.map((task) => {
                const awaitingVerification =
                  task.verification_status === "pending";

                const isVerified =
                  task.verification_status === "verified";

                const isRejected =
                  task.verification_status === "rejected";

                return (
                  <article
                    key={task.id}
                    className="min-w-0 rounded-xl border border-gray-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-md sm:p-6"
                  >
                    {/* Task Title */}

                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                          Task #{task.id}
                        </p>

                        <h3 className="break-words text-lg font-bold text-gray-900">
                          {task.title}
                        </h3>
                      </div>

                      <span
                        className={`w-fit shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${getPriorityStyle(
                          task.priority
                        )}`}
                      >
                        {formatLabel(task.priority)} Priority
                      </span>
                    </div>

                    {/* Description */}

                    <p className="mt-4 min-h-12 break-words text-sm leading-6 text-gray-600">
                      {task.description ||
                        "No description provided."}
                    </p>

                    {/* Task Information */}

                    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
                      <span
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getStatusStyle(
                          task.status
                        )}`}
                      >
                        {formatLabel(task.status)}
                      </span>

                      {task.due_date && (
                        <span className="text-xs text-gray-500">
                          Due: {new Date(task.due_date).toLocaleString()}
                        </span>
                      )}
                    </div>

                    {/* Verification Status */}

                    <div className="mt-4 rounded-lg border border-gray-100 bg-slate-50 p-4">
                      <p className="mb-2 text-sm font-semibold text-gray-700">
                        Admin Verification
                      </p>

                      <span
                        className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${getVerificationStyle(
                          task.verification_status
                        )}`}
                      >
                        {task.verification_status === "not_submitted"
                          ? "Not Submitted"
                          : formatLabel(task.verification_status)}
                      </span>

                      {awaitingVerification && (
                        <p className="mt-3 text-sm leading-6 text-amber-700">
                          Your completed task has been submitted successfully.
                          It is waiting for admin verification.
                        </p>
                      )}

                      {isVerified && (
                        <div className="mt-3">
                          <p className="text-sm font-medium leading-6 text-green-700">
                            Your task has been verified and approved by the admin.
                          </p>

                          {task.verified_at && (
                            <p className="mt-1 text-xs text-gray-500">
                              Verified on:{" "}
                              {new Date(task.verified_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                      )}

                      {isRejected && (
                        <div className="mt-3">
                          <p className="text-sm font-medium text-red-700">
                            Your task was rejected by the admin.
                          </p>

                          <div className="mt-2 rounded-lg border border-red-100 bg-white p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Admin Feedback
                            </p>

                            <p className="mt-1 break-words text-sm leading-6 text-gray-700">
                              {task.rejection_reason ||
                                "No rejection reason was provided."}
                            </p>
                          </div>

                          <p className="mt-2 text-sm text-blue-700">
                            Please correct the task and submit it again for verification.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Status Update */}

                    <div className="mt-5 border-t border-gray-100 pt-4">
                      <p className="mb-3 text-sm font-semibold text-gray-700">
                        Update Task Status
                      </p>

                      {isVerified ? (
                        <p className="rounded-lg bg-green-50 p-3 text-sm font-medium text-green-700">
                          This task is verified. No further changes are allowed.
                        </p>
                      ) : awaitingVerification ? (
                        <p className="rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-700">
                          Please wait for the admin to review your completed task.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {[
                            "pending",
                            "in_progress",
                            "completed",
                          ].map((status) => {
                            const disabled =
                              updatingTaskId === task.id ||
                              task.status === status ||
                              (isRejected && status === "pending");

                            return (
                              <button
                                key={status}
                                type="button"
                                disabled={disabled}
                                onClick={() =>
                                  updateTaskStatus(task.id, status)
                                }
                                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                                  task.status === status
                                    ? "cursor-not-allowed border-blue-600 bg-blue-600 text-white"
                                    : disabled
                                    ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                                    : "border-gray-200 bg-white text-gray-600 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700"
                                }`}
                              >
                                {updatingTaskId === task.id
                                  ? "Updating..."
                                  : status === "completed"
                                  ? isRejected
                                    ? "Resubmit for Verification"
                                    : "Complete Task"
                                  : formatLabel(status)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                  </article>
                );
              })}

            </div>
          )}

        </section>

        {/* Footer */}

        <footer className="py-6 text-center text-sm text-gray-400">
          Employee Task Management System
        </footer>

      </div>
    </main>
  );
}
