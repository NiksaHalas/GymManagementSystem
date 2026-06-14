import type { MembershipStatus } from "@/lib/db/types";

/** Shape returned by the `search_members` RPC (member row + active membership summary). */
export interface MemberSearchRow {
  id: string;
  member_no: number | null;
  first_name: string;
  last_name: string;
  phone: string;
  discount_flag: boolean;
  comment: string | null;
  archived: boolean;
  created_at: string;
  membership_status: MembershipStatus | null;
  membership_label: string | null;
  membership_end_date: string | null;
  membership_sessions_left: number | null;
  membership_is_time_based: boolean | null;
  total_count: number;
}

/** Minimal membership summary used to derive the display status. */
export interface MembershipSummary {
  status: MembershipStatus | null;
  endDate: string | null;
  sessionsLeft: number | null;
  isTimeBased: boolean | null;
}
