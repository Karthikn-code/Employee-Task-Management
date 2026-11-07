
"use client";

interface Task {
  id: number;
  title: string;
  priority: string;
  status: string;
}

interface TaskAnalyticsProps {
  tasks: Task[];
}

export default function TaskAnalytics({
  tasks,
}: TaskAnalyticsProps) {
  const total = tasks.length;

  const completed = tasks.filter(
    (task) => task.status === "completed"
  ).length;

  const inProgress = tasks.filter(
    (task) => task.status === "in_progress"
  ).length;

  const pending = tasks.filter(
    (task) => task.status === "pending"
  ).length;

  const completionRate =
    total > 0 ? Math.round((completed / total) * 100) : 0;

  const statistics = [
    {
      label: "Completed",
      count: completed,
      color: "bg-green-500",
      text: "text-green-600",
    },
    {
      label: "In Progress",
      count: inProgress,
      color: "bg-blue-500",
      text: "text-blue-600",
    },
    {
      label: "Pending",
      count: pending,
      color: "bg-amber-400",
      text: "text-amber-600",
    },
  ];

  return (
    <section
      id="analytics"
      className="mb-8 grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-3"
    >
      {/* Completion Overview */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-slate-500">
          Overall Completion
        </p>

        <div className="mt-5 flex items-center gap-5">
          <div
            className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(#2563eb ${completionRate * 3.6}deg, #e2e8f0 0deg)`,
            }}
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white">
              <span className="text-2xl font-bold text-slate-900">
                {completionRate}%
              </span>
            </div>
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-900">
              {completed} / {total}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Tasks completed
            </p>
          </div>
        </div>
      </div>

      {/* Task Distribution */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
        <h3 className="text-base font-semibold text-slate-900">
          Task Distribution
        </h3>

        <p className="mt-1 text-sm text-slate-500">
          Overview of tasks by current status.
        </p>

        <div className="mt-6 space-y-5">
          {statistics.map((item) => {
            const percentage =
              total > 0
                ? Math.round((item.count / total) * 100)
                : 0;

            return (
              <div key={item.label}>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${item.color}`}
                    />
                    <span className="text-sm font-medium text-slate-700">
                      {item.label}
                    </span>
                  </div>

                  <span className="text-sm font-semibold text-slate-900">
                    {item.count} ({percentage}%)
                  </span>
                </div>

                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${item.color}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
