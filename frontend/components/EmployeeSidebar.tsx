
"use client";

import { useState } from "react";

interface EmployeeSidebarProps {
  name: string;
  onLogout: () => void;
}

const navigation = [
  { label: "Dashboard", href: "#overview", icon: "◫" },
  { label: "My Tasks", href: "#my-tasks", icon: "▤" },
];

export default function EmployeeSidebar({
  name,
  onLogout,
}: EmployeeSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Dashboard");

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-6 py-6">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">
          TaskFlow<span className="text-blue-600">.</span>
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Employee Workspace
        </p>
      </div>

      <div className="flex-1 px-4 py-6">
        <p className="mb-4 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Workspace
        </p>

        <nav className="space-y-1">
          {navigation.map((item) => (
            <a
              key={item.label}
              href={item.href}
              onClick={() => {
                setActiveItem(item.label);
                setMobileOpen(false);
              }}
              className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition ${
                activeItem === item.label
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <span className="w-5 text-center text-lg">
                {item.icon}
              </span>
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="border-t border-slate-200 p-4">
        <div className="mb-4 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700">
            {name.charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">
              {name}
            </p>
            <p className="text-xs text-slate-500">Employee</p>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
        >
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed left-0 right-0 top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <h2 className="text-lg font-bold text-slate-900">
          TaskFlow<span className="text-blue-600">.</span>
        </h2>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
        >
          {mobileOpen ? "Close" : "Menu"}
        </button>
      </div>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <>
          <button
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden"
          />

          <aside className="fixed bottom-0 left-0 top-0 z-50 w-72 max-w-[85vw] border-r border-slate-200 bg-white lg:hidden">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
