import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Shield } from "lucide-react";
import { isDemoMode } from "@/lib/demo";
import { DemoLoginButtons } from "./demo-login-buttons";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Prijava — Teretana",
};

export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm shadow-lg">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center mb-2">
          <Shield className="h-8 w-8 text-primary" />
        </div>
        <CardTitle className="text-2xl">Prijava</CardTitle>
        <CardDescription>
          Unesite korisničko ime i lozinku da biste pristupili sistemu.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Suspense>
          <LoginForm />
        </Suspense>
        {isDemoMode() && <DemoLoginButtons />}
      </CardContent>
    </Card>
  );
}
