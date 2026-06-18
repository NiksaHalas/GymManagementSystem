"use client";

import { toast } from "sonner";
import { Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  setThisDeviceAsCounterAction,
  unsetCounterDeviceAction,
} from "@/app/(app)/(shell)/nalozi/counter-actions";

interface CounterDeviceToggleProps {
  isCounter: boolean;
}

export function CounterDeviceToggle({ isCounter }: CounterDeviceToggleProps) {
  async function handleToggle() {
    try {
      if (isCounter) {
        await unsetCounterDeviceAction();
        toast.success("Ovaj uređaj više nije registrovan kao šalter.");
      } else {
        await setThisDeviceAsCounterAction();
        toast.success("Ovaj uređaj je sada registrovan kao šalter.");
      }
    } catch {
      toast.error("Greška. Proverite da li imate admin privilegije.");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Monitor className="h-4 w-4 text-muted-foreground" />
      <div className="flex-1">
        <p className="text-sm font-medium">Ovaj uređaj</p>
        <p className="text-xs text-muted-foreground">
          {isCounter
            ? "Registrovan kao šalter — smene se prate."
            : "Nije šalter — smene se ne prate."}
        </p>
      </div>
      {isCounter && (
        <Badge variant="secondary" className="text-xs">
          Šalter
        </Badge>
      )}
      <Button
        variant={isCounter ? "outline" : "default"}
        size="sm"
        onClick={handleToggle}
      >
        {isCounter ? "Ukloni šalter" : "Označi kao šalter"}
      </Button>
    </div>
  );
}
