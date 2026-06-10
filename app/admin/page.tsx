import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Dashboard from "@/components/Dashboard";
import type { Registration } from "@/lib/types";

// Always render fresh — the dashboard is a live registration desk.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already guards this, but verify here too (defense in depth).
  if (!user) {
    redirect("/admin/login");
  }

  const { data, error } = await supabase
    .from("registrations")
    .select("*")
    .order("created_at", { ascending: false });

  const initialRows: Registration[] = error ? [] : (data ?? []);

  return (
    <Dashboard
      initialRows={initialRows}
      userEmail={user.email ?? ""}
      loadError={Boolean(error)}
    />
  );
}
