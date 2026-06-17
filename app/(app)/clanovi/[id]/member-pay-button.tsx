"use client";

import * as React from "react";
import { Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentDialog } from "@/components/payment/payment-dialog";

interface MemberPayButtonProps {
  memberId: string;
}

export function MemberPayButton({ memberId }: MemberPayButtonProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Banknote className="mr-2 h-4 w-4" />
        Naplati
      </Button>
      <PaymentDialog
        memberId={memberId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
