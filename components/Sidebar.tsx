"use client";

import Link from "next/link";

export default function Sidebar() {
  return (
    <div className="w-[220px] min-h-screen bg-black text-white p-5">
      <h2 className="text-lg font-bold mb-6">📅 Menu</h2>

      <div className="space-y-3">
        <p>
          <Link href="/dashboard">Dashboard</Link>
        </p>
        <p>
          <Link href="/meeting-requests">Meeting Requests</Link>
        </p>
        <p>
          <Link href="/execution-checklists">Execution Checklists</Link>
        </p>
        <p>
          <Link href="/new-request">New Request</Link>
        </p>
      </div>
    </div>
  );
}