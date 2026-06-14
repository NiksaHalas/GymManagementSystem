/**
 * Layout for unauthenticated pages: login, forgot-password, reset.
 * Centred single-column, no app shell.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      {children}
    </div>
  );
}
