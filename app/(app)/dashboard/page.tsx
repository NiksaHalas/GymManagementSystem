import { getCurrentStaff } from "@/lib/auth/session";

export const metadata = {
  title: "Dashboard — Teretana",
};

export default async function DashboardPage() {
  const staff = await getCurrentStaff();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-2">Dashboard</h1>
      <p className="text-muted-foreground">
        Dobrodošli, <strong>{staff?.username}</strong>. Ovde će biti prikazane
        dnevne prijave članova.
      </p>
    </div>
  );
}
