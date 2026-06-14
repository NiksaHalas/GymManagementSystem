import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KeyRound } from "lucide-react";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = {
  title: "Zaboravljena lozinka — Teretana",
};

export default function ForgotPasswordPage() {
  return (
    <Card className="w-full max-w-sm shadow-lg">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center mb-2">
          <KeyRound className="h-8 w-8 text-primary" />
        </div>
        <CardTitle className="text-2xl">Zaboravljena lozinka</CardTitle>
        <CardDescription>
          Unesite korisničko ime. Ako postoji email za oporavak, poslaćemo vam
          link za resetovanje.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  );
}
