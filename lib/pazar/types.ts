import type {
  MembershipStartMode,
  MembershipStatus,
  PaymentKind,
} from "@/lib/db/types";
import type { CategoryWithTypes } from "@/lib/catalog/types";
import type { MembershipSummary } from "@/lib/members/types";

export interface PaymentRow {
  id: string;
  memberId: string | null;
  memberNo: number | null;
  memberFirstName: string | null;
  memberLastName: string | null;
  kind: PaymentKind;
  label: string;
  amountRsd: number;
  isCustomPrice: boolean;
  customReason: string | null;
  voided: boolean;
  paidAt: string;
  businessDate: string;
  staffUsername: string;
}

export interface TakingsSummary {
  total: number;
  membership: number;
  debtSettlement: number;
  fitpassSurcharge: number;
  count: number;
}

export interface DayTotal {
  businessDate: string;
  total: number;
  count: number;
}

export interface MonthTotal {
  year: number;
  month: number;
  total: number;
  count: number;
}

export interface UnsettledDebt {
  id: string;
  sessionDate: string;
  amountRsd: number;
  trainingCategoryLabel: string;
}

export interface ScheduledMembership {
  id: string;
  label: string;
  package: string;
  createdAt: string;
}

export interface PaymentContext {
  memberId: string;
  memberNo: number | null;
  firstName: string;
  lastName: string;
  discountFlag: boolean;
  currentMembership: MembershipSummary | null;
  scheduledMemberships: ScheduledMembership[];
  unsettledDebts: UnsettledDebt[];
  hasActiveMembership: boolean;
}

export interface PaymentCatalog {
  categories: CategoryWithTypes[];
}

export type { MembershipStartMode, MembershipStatus };
