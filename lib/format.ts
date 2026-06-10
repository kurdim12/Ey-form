import type { Registration } from "./types";

/** Compact relative time, e.g. "just now", "2 min ago", "3 h ago", "5 d ago". */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor((now - then) / 1000));

  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;

  return new Date(iso).toLocaleDateString();
}

/** True if the timestamp falls on today's local calendar date. */
export function isToday(iso: string, now: Date = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function csvCell(value: string): string {
  // Always quote and escape embedded quotes — keeps commas/newlines/Arabic safe.
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Builds a UTF-8 CSV with a BOM so Excel detects encoding and renders Arabic
 * (and other non-Latin) names correctly.
 */
export function registrationsToCsv(rows: Registration[]): string {
  const header = [
    "First name",
    "Last name",
    "Email",
    "Phone",
    "Status",
    "Registered at",
    "Photo URL",
  ];

  const lines = rows.map((r) =>
    [
      r.first_name,
      r.last_name,
      r.email,
      r.phone,
      r.status === "checked_in" ? "Checked in" : "New",
      new Date(r.created_at).toISOString(),
      r.photo_url ?? "",
    ]
      .map((v) => csvCell(String(v)))
      .join(",")
  );

  const bom = "﻿";
  return bom + [header.map(csvCell).join(","), ...lines].join("\r\n");
}
