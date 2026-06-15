export type StaffRole = "user" | "admin";
export type MembershipStatus = "aktivna" | "istekla" | "pauzirana";
export type MembershipStartMode = "payment" | "first_visit";
export type PaymentKind =
  | "membership"
  | "debt_settlement"
  | "fitpass_surcharge";
export type ShiftEndReason = "logout" | "switch" | "auto_close" | "inactivity";

export interface Staff {
  id: string;
  username: string;
  role: StaffRole;
  recovery_email: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Shift {
  id: string;
  staff_id: string;
  started_at: string;
  ended_at: string | null;
  ended_reason: ShiftEndReason | null;
  created_at: string;
}

export interface Member {
  id: string;
  member_no: number | null;
  first_name: string;
  last_name: string;
  phone: string;
  discount_flag: boolean;
  comment: string | null;
  archived: boolean;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export interface TrainingCategory {
  id: number;
  code: string;
  label: string;
  is_trainer_based: boolean;
  per_trainee: boolean;
  active: boolean;
  sort_order: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipType {
  id: number;
  training_category_id: number;
  package: string;
  label: string;
  is_time_based: boolean;
  sessions: number | null;
  duration_days: number;
  active: boolean;
  created_at: string;
}

export interface Price {
  id: number;
  membership_type_id: number;
  amount_rsd: number;
  is_discount_price: boolean;
  active: boolean;
  updated_by: string | null;
  updated_at: string;
}

export interface Membership {
  id: string;
  member_id: string;
  membership_type_id: number;
  start_mode: MembershipStartMode;
  start_date: string | null;
  end_date: string | null;
  sessions_total: number | null;
  sessions_left: number | null;
  status: MembershipStatus;
  paused_days: number;
  paused_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export interface Payment {
  id: string;
  member_id: string | null;
  staff_id: string;
  membership_type_id: number | null;
  membership_id: string | null;
  kind: PaymentKind;
  amount_rsd: number;
  is_custom_price: boolean;
  custom_reason: string | null;
  is_fitpass: boolean;
  business_date: string;
  paid_at: string;
  voided: boolean;
  voided_by: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export interface Checkin {
  id: string;
  member_id: string | null;
  staff_id: string;
  membership_id: string | null;
  key_no: number | null;
  with_trainer: boolean;
  training_category_id: number | null;
  trainer_id: string | null;
  decremented_session: boolean;
  is_fitpass: boolean;
  is_group_fitpass: boolean;
  key_returned: boolean;
  checked_out_at: string | null;
  business_date: string;
  voided: boolean;
  voided_at: string | null;
  voided_by: string | null;
  created_at: string;
  created_by: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface SessionLog {
  id: string;
  member_id: string;
  membership_id: string | null;
  checkin_id: string | null;
  trainer_id: string | null;
  training_category_id: number;
  session_date: string;
  created_at: string;
}

export interface ReservedSession {
  id: string;
  member_id: string;
  checkin_id: string | null;
  training_category_id: number;
  session_date: string;
  amount_rsd: number;
  settled: boolean;
  settled_payment_id: string | null;
  settled_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface GymKey {
  key_no: number;
  active: boolean;
}

export type Database = {
  public: {
    Tables: {
      staff: { Row: Staff; Insert: Omit<Staff, "created_at" | "updated_at">; Update: Partial<Staff> };
      shift: { Row: Shift; Insert: Omit<Shift, "created_at" | "id">; Update: Partial<Shift> };
      member: { Row: Member; Insert: Omit<Member, "created_at" | "updated_at" | "id">; Update: Partial<Member> };
      training_category: { Row: TrainingCategory; Insert: Omit<TrainingCategory, "id" | "created_at" | "updated_at">; Update: Partial<TrainingCategory> };
      membership_type: { Row: MembershipType; Insert: Omit<MembershipType, "id" | "created_at">; Update: Partial<MembershipType> };
      price: { Row: Price; Insert: Omit<Price, "id" | "updated_at">; Update: Partial<Price> };
      membership: { Row: Membership; Insert: Omit<Membership, "created_at" | "updated_at" | "id">; Update: Partial<Membership> };
      payment: { Row: Payment; Insert: Omit<Payment, "created_at" | "updated_at" | "id">; Update: Partial<Payment> };
      checkin: { Row: Checkin; Insert: Omit<Checkin, "created_at" | "updated_at" | "id">; Update: Partial<Checkin> };
      session_log: { Row: SessionLog; Insert: Omit<SessionLog, "created_at" | "id">; Update: Partial<SessionLog> };
      reserved_session: { Row: ReservedSession; Insert: Omit<ReservedSession, "created_at" | "id">; Update: Partial<ReservedSession> };
      gym_key: { Row: GymKey; Insert: GymKey; Update: Partial<GymKey> };
    };
  };
};
