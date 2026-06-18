import { requireUser } from "@/lib/auth/session";

/**
 * Authenticated app root — session gate only.
 * Sidebar shell and counter gate live in (shell)/layout.tsx.
 * Workers off-counter use /samo-salter (no shell).
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return <>{children}</>;
}
