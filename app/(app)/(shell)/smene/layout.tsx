import { requireAdmin } from "@/lib/auth/session";

export default async function SmeneLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return <>{children}</>;
}
