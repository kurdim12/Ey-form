"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { strings } from "@/lib/strings";
import { timeAgo, isToday, registrationsToCsv } from "@/lib/format";
import type { Registration, RegistrationStatus } from "@/lib/types";

interface Props {
  initialRows: Registration[];
  userEmail: string;
  loadError: boolean;
}

export default function Dashboard({ initialRows, userEmail, loadError }: Props) {
  const supabase = createClient();
  const router = useRouter();

  const [rows, setRows] = useState<Registration[]>(initialRows);
  const [connected, setConnected] = useState(false);
  const [query, setQuery] = useState("");
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // Tick so relative times stay current without a refresh.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Realtime: INSERT prepends (with highlight), UPDATE patches in place.
  useEffect(() => {
    let channel: RealtimeChannel | null = null;

    async function setup() {
      // Ensure the realtime socket is authenticated so RLS allows the stream.
      // (With RLS on, an unauthenticated socket silently receives nothing.)
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase
        .channel("registrations-changes")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "registrations" },
          (payload) => {
            const row = payload.new as Registration;
            setRows((prev) =>
              prev.some((r) => r.id === row.id) ? prev : [row, ...prev]
            );
            setFlashIds((prev) => new Set(prev).add(row.id));
            setTimeout(() => {
              setFlashIds((prev) => {
                const next = new Set(prev);
                next.delete(row.id);
                return next;
              });
            }, 2000);
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "registrations" },
          (payload) => {
            const row = payload.new as Registration;
            setRows((prev) =>
              prev.map((r) => (r.id === row.id ? { ...r, ...row } : r))
            );
          }
        )
        .subscribe((status) => {
          setConnected(status === "SUBSCRIBED");
        });
    }

    setup();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.first_name, r.last_name, r.email, r.phone]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, query]);

  const todayCount = useMemo(
    () => rows.filter((r) => isToday(r.created_at)).length,
    [rows]
  );

  async function toggleStatus(r: Registration) {
    const next: RegistrationStatus =
      r.status === "new" ? "checked_in" : "new";

    // Optimistic; realtime UPDATE will confirm (idempotent).
    setRows((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, status: next } : x))
    );

    const { error } = await supabase
      .from("registrations")
      .update({ status: next })
      .eq("id", r.id);

    if (error) {
      // Revert on failure.
      setRows((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, status: r.status } : x))
      );
    }
  }

  function exportCsv() {
    const csv = registrationsToCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registrations-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <main className="min-h-dvh px-4 py-6 sm:px-8 sm:py-8 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl text-cream leading-none">
            {strings.admin.title}
          </h1>
          <p className="text-xs uppercase tracking-[0.25em] text-gold mt-1">
            {strings.admin.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="text-2xl font-serif text-cream leading-none">
              {rows.length}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-cream-dim">
              {strings.admin.total}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-serif text-gold leading-none">
              {todayCount}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-cream-dim">
              {strings.admin.today}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                connected ? "bg-gold live-dot" : "bg-cream-dim/40"
              }`}
              aria-hidden
            />
            <span className="text-xs text-cream-dim">
              {connected ? strings.admin.live : strings.admin.offline}
            </span>
          </div>

          <button
            onClick={signOut}
            className="text-sm text-cream-dim hover:text-cream transition border border-charcoal-line rounded-lg px-3 py-1.5"
          >
            {strings.admin.signOut}
          </button>
        </div>
      </header>

      <div className="gold-rule mb-6" />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          className="field flex-1 min-w-[200px]"
          placeholder={strings.admin.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="rounded-lg border border-gold/60 text-gold hover:bg-gold hover:text-charcoal transition px-4 py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {strings.admin.exportCsv}
        </button>
      </div>

      {loadError && (
        <p className="text-sm text-danger mb-4" role="alert">
          Couldn&apos;t load registrations. Check your connection and refresh.
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="text-cream-dim text-center py-16">
          {rows.length === 0 ? strings.admin.empty : strings.admin.noMatches}
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-charcoal-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-cream-dim border-b border-charcoal-line bg-charcoal-soft/60">
                  <th className="font-medium px-4 py-3">
                    {strings.admin.colGuest}
                  </th>
                  <th className="font-medium px-4 py-3">
                    {strings.admin.colContact}
                  </th>
                  <th className="font-medium px-4 py-3">
                    {strings.admin.colRegistered}
                  </th>
                  <th className="font-medium px-4 py-3 text-right">
                    {strings.admin.colStatus}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-charcoal-line/60 last:border-0 ${
                      flashIds.has(r.id) ? "flash-new" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Thumb url={r.photo_url} onOpen={setLightbox} />
                        <span className="text-cream">
                          {r.first_name} {r.last_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-cream-dim">
                      <div>{r.email}</div>
                      <div className="text-xs">{r.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-cream-dim whitespace-nowrap">
                      {timeAgo(r.created_at, now)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <StatusToggle r={r} onToggle={toggleStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((r) => (
              <div
                key={r.id}
                className={`rounded-xl border border-charcoal-line bg-charcoal-soft/60 p-4 ${
                  flashIds.has(r.id) ? "flash-new" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <Thumb url={r.photo_url} onOpen={setLightbox} />
                  <div className="min-w-0 flex-1">
                    <div className="text-cream truncate">
                      {r.first_name} {r.last_name}
                    </div>
                    <div className="text-xs text-cream-dim truncate">
                      {r.email}
                    </div>
                    <div className="text-xs text-cream-dim">{r.phone}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-cream-dim">
                    {timeAgo(r.created_at, now)}
                  </span>
                  <StatusToggle r={r} onToggle={toggleStatus} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-center text-xs text-cream-dim/60 mt-8">{userEmail}</p>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Guest"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
          />
        </div>
      )}
    </main>
  );
}

function Thumb({
  url,
  onOpen,
}: {
  url: string | null;
  onOpen: (url: string) => void;
}) {
  if (!url) {
    return (
      <div className="h-10 w-10 rounded-full bg-charcoal-line shrink-0" />
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(url)}
      className="h-10 w-10 rounded-full overflow-hidden shrink-0 border border-charcoal-line focus:outline-none focus:ring-1 focus:ring-gold"
      aria-label="Open photo"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-full w-full object-cover" />
    </button>
  );
}

function StatusToggle({
  r,
  onToggle,
}: {
  r: Registration;
  onToggle: (r: Registration) => void;
}) {
  const checkedIn = r.status === "checked_in";
  return (
    <button
      onClick={() => onToggle(r)}
      className={`text-xs font-medium rounded-full px-3 py-1.5 border transition ${
        checkedIn
          ? "bg-gold text-charcoal border-gold"
          : "text-cream-dim border-charcoal-line hover:border-gold hover:text-gold"
      }`}
    >
      {checkedIn ? strings.admin.statusCheckedIn : strings.admin.statusNew}
    </button>
  );
}
