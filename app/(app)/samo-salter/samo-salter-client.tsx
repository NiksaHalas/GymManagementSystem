"use client";

import { signOutAction } from "@/lib/shifts/actions";
import { isRedirectError } from "@/lib/redirect-error";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogOut, Monitor } from "lucide-react";
import { toast } from "sonner";

export function SamoSalterClient() {
  async function handleSignOut() {
    try {
      await signOutAction();
    } catch (e) {
      if (isRedirectError(e)) throw e;
      toast.error("Greška pri odjavi.");
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Monitor className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle>Operacije samo na šalteru</CardTitle>
          <CardDescription>
            Prijavljeni ste, ali ovaj uređaj nije registrovan kao šalter.
            Check-in, uplate i ostale operacije dostupne su samo na šalteru.
            Kontaktirajte administratora ako mislite da je ovo greška.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Odjava
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
