"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { strings } from "@/lib/strings";
import {
  timeAgo,
  isToday,
  formatDateTime,
  photoPathFromUrl,
  registrationsToCsv,
} from "@/lib/format";
import type { Registration, RegistrationStatus } from "@/lib/types";

interface Props {
  initialRows: Registration[];
  userEmail: string;
  loadError: boolean;
}

type StatusFilter = "all" | "new" | "checked_in";
type SortBy = "newest" | "oldest" | "name";

export default function Dashboard({ initialRows, userEmail, loadError }: Props) {
  const supabase = createClient();
  const router = useRouter();

  const [rows, setRows] = useState<Registration[]>(initialRows);
  const [connected, setConnected] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Bulk selection + quick check-in mode
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [quickMode, setQuickMode] = useState(false);

  // Tick so relative times stay current without a refresh.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Realtime: INSERT prepends (with highlight), UPDATE patches, DELETE removes.
  useEffect(() => {
    let channel: RealtimeChannel | null = null;

    async function setup() {
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
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "registrations" },
          (payload) => {
            const old = payload.old as { id: string };
            setRows((prev) => prev.filter((r) => r.id !== old.id));
            setSelectedId((cur) => (cur === old.id ? null : cur));
            setPicked((prev) => {
              if (!prev.has(old.id)) return prev;
              const next = new Set(prev);
              next.delete(old.id);
              return next;
            });
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

  // Stats
  const total = rows.length;
  const arrived = useMemo(
    () => rows.filter((r) => r.status === "checked_in").length,
    [rows]
  );
  const todayCount = useMemo(
    () => rows.filter((r) => isToday(r.created_at)).length,
    [rows]
  );
  const arrivedPct = total === 0 ? 0 : Math.round((arrived / total) * 100);

  // Search → status filter → sort
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;

    if (q) {
      list = list.filter((r) =>
        [r.first_name, r.last_name, r.email, r.phone]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortBy === "name") {
        return `${a.first_name} ${a.last_name}`.localeCompare(
          `${b.first_name} ${b.last_name}`
        );
      }
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      return sortBy === "oldest" ? da - db : db - da;
    });
    return sorted;
  }, [rows, query, statusFilter, sortBy]);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId]
  );

  // ---- status changes ----
  async function setStatus(r: Registration, next: RegistrationStatus) {
    if (r.status === next) return;
    setRows((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, status: next } : x))
    );
    const { error } = await supabase
      .from("registrations")
      .update({ status: next })
      .eq("id", r.id);
    if (error) {
      setRows((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, status: r.status } : x))
      );
    }
  }

  function toggleStatus(r: Registration) {
    setStatus(r, r.status === "new" ? "checked_in" : "new");
  }

  async function deleteGuest(r: Registration) {
    const prevRows = rows;
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    setSelectedId((cur) => (cur === r.id ? null : cur));

    const { error } = await supabase
      .from("registrations")
      .delete()
      .eq("id", r.id);
    if (error) {
      setRows(prevRows);
      return;
    }
    const path = photoPathFromUrl(r.photo_url);
    if (path) await supabase.storage.from("photos").remove([path]);
  }

  // ---- bulk actions ----
  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allVisiblePicked =
    visible.length > 0 && visible.every((r) => picked.has(r.id));

  function togglePickAllVisible() {
    setPicked((prev) => {
      if (allVisiblePicked) {
        const next = new Set(prev);
        visible.forEach((r) => next.delete(r.id));
        return next;
      }
      const next = new Set(prev);
      visible.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function clearPicked() {
    setPicked(new Set());
    setBulkConfirm(false);
  }

  async function bulkSetStatus(next: RegistrationStatus) {
    const ids = [...picked];
    if (ids.length === 0) return;
    const prevRows = rows;
    setRows((prev) =>
      prev.map((x) => (picked.has(x.id) ? { ...x, status: next } : x))
    );
    const { error } = await supabase
      .from("registrations")
      .update({ status: next })
      .in("id", ids);
    if (error) setRows(prevRows);
    clearPicked();
  }

  async function bulkDelete() {
    const targets = rows.filter((r) => picked.has(r.id));
    if (targets.length === 0) return;
    const ids = targets.map((r) => r.id);
    const prevRows = rows;
    setRows((prev) => prev.filter((x) => !picked.has(x.id)));
    clearPicked();

    const { error } = await supabase
      .from("registrations")
      .delete()
      .in("id", ids);
    if (error) {
      setRows(prevRows);
      return;
    }
    const paths = targets
      .map((r) => photoPathFromUrl(r.photo_url))
      .filter((p): p is string => Boolean(p));
    if (paths.length) await supabase.storage.from("photos").remove(paths);
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

  // ---- quick check-in mode takes over the screen ----
  if (quickMode) {
    return (
      <QuickCheckIn
        rows={rows}
        connected={connected}
        arrived={arrived}
        total={total}
        onCheckIn={(r) => setStatus(r, "checked_in")}
        onUndo={(r) => setStatus(r, "new")}
        onExit={() => setQuickMode(false)}
      />
    );
  }

  return (
    <main className="min-h-dvh px-4 py-6 sm:px-8 sm:py-8 max-w-6xl mx-auto pb-24">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl text-cream leading-none">
            {strings.admin.title}
          </h1>
          <p className="text-xs uppercase tracking-[0.25em] text-gold mt-1">
            {strings.admin.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-5">
          <Stat value={total} label={strings.admin.total} />
          <Stat value={todayCount} label={strings.admin.today} gold />

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

      {/* Check-in progress + quick mode entry */}
      <div className="rounded-xl border border-charcoal-line bg-charcoal-soft/60 px-4 py-3 mb-5">
        <div className="flex items-center justify-between gap-4 text-sm mb-2">
          <span className="text-cream">
            {strings.admin.arrivedSummary
              .replace("{n}", String(arrived))
              .replace("{total}", String(total))}
          </span>
          <div className="flex items-center gap-4">
            <span className="text-cream-dim">
              {strings.admin.remaining}:{" "}
              <span className="text-cream">{total - arrived}</span>
            </span>
            <button
              onClick={() => setQuickMode(true)}
              className="rounded-lg bg-gold text-charcoal text-xs font-medium px-3 py-1.5 hover:bg-gold-soft transition"
            >
              {strings.admin.quickMode}
            </button>
          </div>
        </div>
        <div className="h-1.5 w-full rounded-full bg-charcoal-line overflow-hidden">
          <div
            className="h-full rounded-full bg-gold transition-all duration-500"
            style={{ width: `${arrivedPct}%` }}
          />
        </div>
      </div>

      <div className="gold-rule mb-5" />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          className="field flex-1 min-w-[200px]"
          placeholder={strings.admin.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="cursor-pointer rounded-lg border border-charcoal-line bg-charcoal-soft text-cream text-sm px-3 py-2.5 outline-none focus:border-gold"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          aria-label={strings.admin.sortLabel}
        >
          <option value="newest">{strings.admin.sortNewest}</option>
          <option value="oldest">{strings.admin.sortOldest}</option>
          <option value="name">{strings.admin.sortName}</option>
        </select>
        <button
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="rounded-lg border border-gold/60 text-gold hover:bg-gold hover:text-charcoal transition px-4 py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {strings.admin.exportCsv}
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-2 mb-5 text-sm">
        <FilterTab
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
          label={strings.admin.filterAll}
          count={total}
        />
        <FilterTab
          active={statusFilter === "new"}
          onClick={() => setStatusFilter("new")}
          label={strings.admin.filterNew}
          count={total - arrived}
        />
        <FilterTab
          active={statusFilter === "checked_in"}
          onClick={() => setStatusFilter("checked_in")}
          label={strings.admin.filterCheckedIn}
          count={arrived}
        />
      </div>

      {loadError && (
        <p className="text-sm text-danger mb-4" role="alert">
          Couldn&apos;t load registrations. Check your connection and refresh.
        </p>
      )}

      {visible.length === 0 ? (
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
                  <th className="w-10 px-4 py-3">
                    <Check
                      checked={allVisiblePicked}
                      onChange={togglePickAllVisible}
                      label={strings.admin.selectAll}
                    />
                  </th>
                  <th className="font-medium px-2 py-3">
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
                {visible.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`border-b border-charcoal-line/60 last:border-0 cursor-pointer hover:bg-charcoal-soft/40 transition ${
                      flashIds.has(r.id) ? "flash-new" : ""
                    } ${picked.has(r.id) ? "bg-gold/5" : ""}`}
                  >
                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Check
                        checked={picked.has(r.id)}
                        onChange={() => togglePick(r.id)}
                        label={`Select ${r.first_name} ${r.last_name}`}
                      />
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-3">
                        <Thumb url={r.photo_url} />
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
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <StatusToggle r={r} onToggle={toggleStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {visible.map((r) => (
              <div
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`rounded-xl border bg-charcoal-soft/60 p-4 cursor-pointer ${
                  picked.has(r.id) ? "border-gold/50" : "border-charcoal-line"
                } ${flashIds.has(r.id) ? "flash-new" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <div onClick={(e) => e.stopPropagation()}>
                    <Check
                      checked={picked.has(r.id)}
                      onChange={() => togglePick(r.id)}
                      label={`Select ${r.first_name} ${r.last_name}`}
                    />
                  </div>
                  <Thumb url={r.photo_url} />
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
                  <div onClick={(e) => e.stopPropagation()}>
                    <StatusToggle r={r} onToggle={toggleStatus} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-center text-xs text-cream-dim/60 mt-8">{userEmail}</p>

      {/* Bulk selection toolbar */}
      {picked.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-charcoal-line bg-charcoal-soft/95 backdrop-blur px-4 py-3">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-cream">
              {strings.admin.selectedCount.replace("{n}", String(picked.size))}
            </span>
            {bulkConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-cream-dim">
                  {strings.admin.bulkDeleteConfirm.replace(
                    "{n}",
                    String(picked.size)
                  )}
                </span>
                <button
                  onClick={() => setBulkConfirm(false)}
                  className="rounded-lg border border-charcoal-line px-3 py-1.5 text-sm text-cream-dim hover:text-cream"
                >
                  {strings.admin.cancel}
                </button>
                <button
                  onClick={bulkDelete}
                  className="rounded-lg bg-danger/90 hover:bg-danger text-charcoal px-3 py-1.5 text-sm font-medium"
                >
                  {strings.admin.bulkDelete}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => bulkSetStatus("checked_in")}
                  className="rounded-lg bg-gold text-charcoal px-3 py-1.5 text-sm font-medium hover:bg-gold-soft"
                >
                  {strings.admin.bulkCheckIn}
                </button>
                <button
                  onClick={() => bulkSetStatus("new")}
                  className="rounded-lg border border-charcoal-line px-3 py-1.5 text-sm text-cream-dim hover:text-cream"
                >
                  {strings.admin.bulkMarkNew}
                </button>
                <button
                  onClick={() => setBulkConfirm(true)}
                  className="rounded-lg border border-danger/40 text-danger/90 hover:bg-danger/10 px-3 py-1.5 text-sm"
                >
                  {strings.admin.bulkDelete}
                </button>
                <button
                  onClick={clearPicked}
                  className="rounded-lg px-3 py-1.5 text-sm text-cream-dim hover:text-cream"
                >
                  {strings.admin.clearSelection}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Guest detail modal */}
      {selected && (
        <GuestModal
          guest={selected}
          onClose={() => setSelectedId(null)}
          onToggle={toggleStatus}
          onDelete={deleteGuest}
          onOpenPhoto={setLightbox}
        />
      )}

      {/* Full-size photo */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
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

function Stat({
  value,
  label,
  gold,
}: {
  value: number;
  label: string;
  gold?: boolean;
}) {
  return (
    <div className="text-right">
      <div
        className={`text-2xl font-serif leading-none ${
          gold ? "text-gold" : "text-cream"
        }`}
      >
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-cream-dim">
        {label}
      </div>
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`h-5 w-5 rounded border flex items-center justify-center transition ${
        checked
          ? "bg-gold border-gold text-charcoal"
          : "border-charcoal-line hover:border-gold"
      }`}
    >
      {checked && (
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
          <path d="M7.5 13.5l-3-3 1-1 2 2 5-5 1 1z" />
        </svg>
      )}
    </button>
  );
}

function FilterTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 border transition ${
        active
          ? "bg-gold text-charcoal border-gold"
          : "text-cream-dim border-charcoal-line hover:border-gold hover:text-gold"
      }`}
    >
      {label}
      <span className={active ? "text-charcoal/70" : "text-cream-dim/60"}>
        {" "}
        · {count}
      </span>
    </button>
  );
}

function Thumb({ url }: { url: string | null }) {
  if (!url) {
    return <div className="h-10 w-10 rounded-full bg-charcoal-line shrink-0" />;
  }
  return (
    <div className="h-10 w-10 rounded-full overflow-hidden shrink-0 border border-charcoal-line">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-full w-full object-cover" />
    </div>
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

function GuestModal({
  guest,
  onClose,
  onToggle,
  onDelete,
  onOpenPhoto,
}: {
  guest: Registration;
  onClose: () => void;
  onToggle: (r: Registration) => void;
  onDelete: (r: Registration) => void;
  onOpenPhoto: (url: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const checkedIn = guest.status === "checked_in";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-charcoal-line bg-charcoal-soft shadow-2xl shadow-black/50 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center">
          {guest.photo_url ? (
            <button
              type="button"
              onClick={() => onOpenPhoto(guest.photo_url!)}
              className="h-28 w-28 rounded-full overflow-hidden border border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold"
              aria-label="Open photo full size"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={guest.photo_url}
                alt={`${guest.first_name} ${guest.last_name}`}
                className="h-full w-full object-cover"
              />
            </button>
          ) : (
            <div className="h-28 w-28 rounded-full bg-charcoal-line" />
          )}

          <h2 className="font-serif text-2xl text-cream mt-4">
            {guest.first_name} {guest.last_name}
          </h2>
          <span
            className={`mt-2 inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 border ${
              checkedIn
                ? "text-gold border-gold/50"
                : "text-cream-dim border-charcoal-line"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                checkedIn ? "bg-gold" : "bg-cream-dim/50"
              }`}
            />
            {checkedIn
              ? strings.admin.statusCheckedIn
              : strings.admin.statusNew}
          </span>
        </div>

        <dl className="mt-5 space-y-2.5 text-sm">
          <DLRow label={strings.form.email}>
            <a
              href={`mailto:${guest.email}`}
              className="text-cream hover:text-gold break-all"
            >
              {guest.email}
            </a>
          </DLRow>
          <DLRow label={strings.form.phone}>
            <a href={`tel:${guest.phone}`} className="text-cream hover:text-gold">
              {guest.phone}
            </a>
          </DLRow>
          <DLRow label={strings.admin.registeredAt}>
            <span className="text-cream">
              {formatDateTime(guest.created_at)}
            </span>
          </DLRow>
        </dl>

        <button
          onClick={() => onToggle(guest)}
          className={`w-full rounded-lg py-3 mt-6 font-medium transition ${
            checkedIn
              ? "border border-charcoal-line text-cream-dim hover:text-cream"
              : "bg-gold text-charcoal hover:bg-gold-soft"
          }`}
        >
          {checkedIn ? strings.admin.undoCheckIn : strings.admin.checkIn}
        </button>

        {confirmDelete ? (
          <div className="mt-4 rounded-lg border border-danger/40 bg-danger/5 p-3 text-center">
            <p className="text-sm text-cream font-medium">
              {strings.admin.deleteConfirmTitle}
            </p>
            <p className="text-xs text-cream-dim mt-1">
              {strings.admin.deleteConfirmBody}
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-lg border border-charcoal-line py-2 text-sm text-cream-dim hover:text-cream"
              >
                {strings.admin.cancel}
              </button>
              <button
                onClick={() => onDelete(guest)}
                className="flex-1 rounded-lg bg-danger/90 hover:bg-danger text-charcoal py-2 text-sm font-medium"
              >
                {strings.admin.deleteConfirmYes}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={onClose}
              className="text-sm text-cream-dim hover:text-cream"
            >
              {strings.admin.close}
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-sm text-danger/80 hover:text-danger"
            >
              {strings.admin.deleteGuest}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DLRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-cream-dim shrink-0">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function QuickCheckIn({
  rows,
  connected,
  arrived,
  total,
  onCheckIn,
  onUndo,
  onExit,
}: {
  rows: Registration[];
  connected: boolean;
  arrived: number;
  total: number;
  onCheckIn: (r: Registration) => void;
  onUndo: (r: Registration) => void;
  onExit: () => void;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const query = q.trim().toLowerCase();
  const list = useMemo(() => {
    if (!query) {
      // No search: show pending arrivals (newest first).
      return rows
        .filter((r) => r.status === "new")
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }
    return rows
      .filter((r) =>
        [r.first_name, r.last_name, r.email, r.phone]
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
      .sort((a, b) =>
        `${a.first_name} ${a.last_name}`.localeCompare(
          `${b.first_name} ${b.last_name}`
        )
      );
  }, [rows, query]);

  return (
    <main className="min-h-dvh max-w-2xl mx-auto px-4 py-6 flex flex-col">
      <header className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="font-serif text-2xl text-cream leading-none">
            {strings.admin.quickModeTitle}
          </h1>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                connected ? "bg-gold live-dot" : "bg-cream-dim/40"
              }`}
              aria-hidden
            />
            <span className="text-xs text-cream-dim">
              {strings.admin.arrivedSummary
                .replace("{n}", String(arrived))
                .replace("{total}", String(total))}
            </span>
          </div>
        </div>
        <button
          onClick={onExit}
          className="rounded-lg border border-charcoal-line px-4 py-2 text-sm text-cream-dim hover:text-cream"
        >
          {strings.admin.quickExit}
        </button>
      </header>

      <input
        ref={inputRef}
        className="field text-lg py-4"
        placeholder={strings.admin.quickSearchPlaceholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="off"
      />

      <p className="text-xs text-cream-dim mt-3 mb-2">
        {query ? "" : strings.admin.quickHintPending}
      </p>

      <div className="flex-1 space-y-2.5 mt-1">
        {list.length === 0 ? (
          <p className="text-center text-cream-dim py-16">
            {query ? strings.admin.noMatches : strings.admin.quickNoPending}
          </p>
        ) : (
          list.map((r) => {
            const checkedIn = r.status === "checked_in";
            return (
              <button
                key={r.id}
                onClick={() => (checkedIn ? onUndo(r) : onCheckIn(r))}
                className={`w-full flex items-center gap-4 rounded-xl border p-3 text-left transition active:scale-[0.99] ${
                  checkedIn
                    ? "border-gold/40 bg-gold/5"
                    : "border-charcoal-line bg-charcoal-soft/60 hover:border-gold"
                }`}
              >
                {r.photo_url ? (
                  <div className="h-14 w-14 rounded-full overflow-hidden shrink-0 border border-charcoal-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.photo_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-14 w-14 rounded-full bg-charcoal-line shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-cream text-lg truncate">
                    {r.first_name} {r.last_name}
                  </div>
                  <div className="text-xs text-cream-dim truncate">
                    {r.phone}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
                    checkedIn
                      ? "text-gold border border-gold/50"
                      : "bg-gold text-charcoal"
                  }`}
                >
                  {checkedIn
                    ? `${strings.admin.quickAlreadyIn} · ${strings.admin.quickUndo}`
                    : strings.admin.quickTapToCheckIn}
                </span>
              </button>
            );
          })
        )}
      </div>
    </main>
  );
}
