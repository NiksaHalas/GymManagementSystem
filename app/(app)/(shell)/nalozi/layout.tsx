import { requireAdmin } from "@/lib/auth/session";

export default async function NaloziLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return <>{children}</>;
}
