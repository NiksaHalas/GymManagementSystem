import { redirect } from "next/navigation";

/**
 * Root "/" redirects to the dashboard.
 * The middleware handles authentication; this just sets the canonical landing page.
 */
export default function RootPage() {
  redirect("/dashboard");
}
