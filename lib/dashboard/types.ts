import type { MemberStatusKind } from "@/lib/members/status";
import type { MemberSearchRow } from "@/lib/members/types";

export const KEY_COUNT = 22;

export interface DayPaymentSummary {
  amountRsd: number;
  membershipLabel: string | null;
  kind: string;
}

export interface DashboardCheckinRow {
  id: string;
  createdAt: string;
  businessDate: string;
  keyNo: number | null;
  keyReturned: boolean;
  checkedOutAt: string | null;
  isFitpass: boolean;
  isGroupFitpass: boolean;
  withTrainer: boolean;
  decrementedSession: boolean;
  hasReservedDebt: boolean;
  memberId: string | null;
  memberNo: number | null;
  firstName: string | null;
  lastName: string | null;
  comment: string | null;
  membershipLabel: string | null;
  membershipStatus: MemberStatusKind;
  membershipStatusLabel: string;
  trainingCategoryLabel: string | null;
  trainerUsername: string | null;
  paymentToday: DayPaymentSummary | null;
  membershipPaused: boolean;
  shiftId: string | null;
  pendingAttribution: boolean;
}

export interface KeyHolder {
  keyNo: number;
  checkinId: string | null;
  memberId: string | null;
  memberNo: number | null;
  firstName: string | null;
  lastName: string | null;
  isFitpass: boolean;
  isOpen: boolean;
}

export interface SoonExpireMember {
  id: string;
  memberNo: number | null;
  firstName: string;
  lastName: string;
  endDate: string;
  daysLeft: number;
  membershipLabel: string | null;
}

export interface DayStats {
  arrivalCount: number;
  openKeysCount: number;
  totalKeys: number;
  takingsRsd: number;
}

export interface StaffOption {
  id: string;
  username: string;
}

/** Trainer-based category selectable at check-in for members without a covering
 * package (S0/S3); only categories that have an active daily (sessions=1) price. */
export interface TrainerCheckinCategory {
  id: number;
  label: string;
  dailyPriceRsd: number;
}

export interface CheckinMemberContext {
  memberId: string;
  memberNo: number | null;
  firstName: string;
  lastName: string;
  phone: string;
  comment: string | null;
  discountFlag: boolean;
  membershipId: string | null;
  membershipLabel: string | null;
  isTrainerBased: boolean;
  trainingCategoryId: number | null;
  trainingCategoryLabel: string | null;
  sessionsLeft: number | null;
  isTimeBased: boolean | null;
  membershipStatus: MemberStatusKind;
  membershipStatusLabel: string;
  unsettledReservedCount: number;
  /** Category of the member's most recent non-voided trainer check-in (passive
   * "last time" hint for the manual category selector); null if never. */
  lastTrainerCategoryId: number | null;
  hasOpenVisit: boolean;
  openVisitKeyNo: number | null;
}

export interface CheckinSearchRow extends MemberSearchRow {
  openVisit: { keyNo: number | null } | null;
}

export interface LastKeyHolder {
  keyNo: number;
  memberId: string | null;
  memberNo: number | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  isFitpass: boolean;
  lastHeldAt: string;
}
