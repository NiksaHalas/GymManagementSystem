"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SmeneWorkerFilterProps {
  staffOptions: { id: string; username: string }[];
  selectedStaffId?: string;
  anchorDate: string;
}

export function SmeneWorkerFilter({
  staffOptions,
  selectedStaffId,
  anchorDate,
}: SmeneWorkerFilterProps) {
  const router = useRouter();

  function onChange(value: string) {
    const params = new URLSearchParams();
    params.set("date", anchorDate);
    if (value !== "all") {
      params.set("staff", value);
    }
    router.push(`/smene?${params.toString()}`);
  }

  return (
    <Select
      value={selectedStaffId ?? "all"}
      onValueChange={onChange}
    >
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Svi radnici" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Svi radnici</SelectItem>
        {staffOptions.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.username}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
