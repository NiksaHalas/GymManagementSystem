export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      checkin: {
        Row: {
          business_date: string
          checked_out_at: string | null
          created_at: string
          created_by: string | null
          decremented_session: boolean
          id: string
          is_fitpass: boolean
          is_group_fitpass: boolean
          key_no: number | null
          key_returned: boolean
          member_id: string | null
          membership_id: string | null
          shift_id: string | null
          staff_id: string
          trainer_id: string | null
          training_category_id: number | null
          updated_at: string
          updated_by: string | null
          voided: boolean
          voided_at: string | null
          voided_by: string | null
          waived_at: string | null
          waived_by: string | null
          with_trainer: boolean
        }
        Insert: {
          business_date: string
          checked_out_at?: string | null
          created_at?: string
          created_by?: string | null
          decremented_session?: boolean
          id?: string
          is_fitpass?: boolean
          is_group_fitpass?: boolean
          key_no?: number | null
          key_returned?: boolean
          member_id?: string | null
          membership_id?: string | null
          shift_id?: string | null
          staff_id: string
          trainer_id?: string | null
          training_category_id?: number | null
          updated_at?: string
          updated_by?: string | null
          voided?: boolean
          voided_at?: string | null
          voided_by?: string | null
          waived_at?: string | null
          waived_by?: string | null
          with_trainer?: boolean
        }
        Update: {
          business_date?: string
          checked_out_at?: string | null
          created_at?: string
          created_by?: string | null
          decremented_session?: boolean
          id?: string
          is_fitpass?: boolean
          is_group_fitpass?: boolean
          key_no?: number | null
          key_returned?: boolean
          member_id?: string | null
          membership_id?: string | null
          shift_id?: string | null
          staff_id?: string
          trainer_id?: string | null
          training_category_id?: number | null
          updated_at?: string
          updated_by?: string | null
          voided?: boolean
          voided_at?: string | null
          voided_by?: string | null
          waived_at?: string | null
          waived_by?: string | null
          with_trainer?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "checkin_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_key_no_fkey"
            columns: ["key_no"]
            isOneToOne: false
            referencedRelation: "gym_key"
            referencedColumns: ["key_no"]
          },
          {
            foreignKeyName: "checkin_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "membership"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shift"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_training_category_id_fkey"
            columns: ["training_category_id"]
            isOneToOne: false
            referencedRelation: "training_category"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_waived_by_fkey"
            columns: ["waived_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_key: {
        Row: {
          active: boolean
          key_no: number
        }
        Insert: {
          active?: boolean
          key_no: number
        }
        Update: {
          active?: boolean
          key_no?: number
        }
        Relationships: []
      }
      login_attempt: {
        Row: {
          attempt_key: string
          attempted_at: string
          id: number
        }
        Insert: {
          attempt_key: string
          attempted_at?: string
          id?: never
        }
        Update: {
          attempt_key?: string
          attempted_at?: string
          id?: never
        }
        Relationships: []
      }
      member: {
        Row: {
          archived: boolean
          archived_at: string | null
          comment: string | null
          created_at: string
          created_by: string | null
          discount_flag: boolean
          first_name: string
          id: string
          last_name: string
          member_no: number | null
          phone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived?: boolean
          archived_at?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          discount_flag?: boolean
          first_name: string
          id?: string
          last_name: string
          member_no?: number | null
          phone: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived?: boolean
          archived_at?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          discount_flag?: boolean
          first_name?: string
          id?: string
          last_name?: string
          member_no?: number | null
          phone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      membership: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          member_id: string
          membership_type_id: number
          paused_at: string | null
          paused_days: number
          sessions_left: number | null
          sessions_total: number | null
          start_date: string | null
          start_mode: Database["public"]["Enums"]["membership_start_mode"]
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          member_id: string
          membership_type_id: number
          paused_at?: string | null
          paused_days?: number
          sessions_left?: number | null
          sessions_total?: number | null
          start_date?: string | null
          start_mode?: Database["public"]["Enums"]["membership_start_mode"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          member_id?: string
          membership_type_id?: number
          paused_at?: string | null
          paused_days?: number
          sessions_left?: number | null
          sessions_total?: number | null
          start_date?: string | null
          start_mode?: Database["public"]["Enums"]["membership_start_mode"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membership_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_membership_type_id_fkey"
            columns: ["membership_type_id"]
            isOneToOne: false
            referencedRelation: "membership_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_type: {
        Row: {
          active: boolean
          created_at: string
          duration_days: number
          id: number
          is_time_based: boolean
          label: string
          package: string
          sessions: number | null
          training_category_id: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          duration_days?: number
          id?: never
          is_time_based: boolean
          label: string
          package: string
          sessions?: number | null
          training_category_id: number
        }
        Update: {
          active?: boolean
          created_at?: string
          duration_days?: number
          id?: never
          is_time_based?: boolean
          label?: string
          package?: string
          sessions?: number | null
          training_category_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "membership_type_training_category_id_fkey"
            columns: ["training_category_id"]
            isOneToOne: false
            referencedRelation: "training_category"
            referencedColumns: ["id"]
          },
        ]
      }
      payment: {
        Row: {
          amount_rsd: number
          business_date: string
          checkin_id: string | null
          created_at: string
          created_by: string | null
          custom_reason: string | null
          id: string
          is_custom_price: boolean
          is_fitpass: boolean
          kind: Database["public"]["Enums"]["payment_kind"]
          member_id: string | null
          membership_id: string | null
          membership_type_id: number | null
          paid_at: string
          shift_id: string | null
          staff_id: string
          updated_at: string
          updated_by: string | null
          void_reason: string | null
          voided: boolean
          voided_at: string | null
          voided_by: string | null
          waived_at: string | null
          waived_by: string | null
        }
        Insert: {
          amount_rsd: number
          business_date: string
          checkin_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_reason?: string | null
          id?: string
          is_custom_price?: boolean
          is_fitpass?: boolean
          kind?: Database["public"]["Enums"]["payment_kind"]
          member_id?: string | null
          membership_id?: string | null
          membership_type_id?: number | null
          paid_at?: string
          shift_id?: string | null
          staff_id: string
          updated_at?: string
          updated_by?: string | null
          void_reason?: string | null
          voided?: boolean
          voided_at?: string | null
          voided_by?: string | null
          waived_at?: string | null
          waived_by?: string | null
        }
        Update: {
          amount_rsd?: number
          business_date?: string
          checkin_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_reason?: string | null
          id?: string
          is_custom_price?: boolean
          is_fitpass?: boolean
          kind?: Database["public"]["Enums"]["payment_kind"]
          member_id?: string | null
          membership_id?: string | null
          membership_type_id?: number | null
          paid_at?: string
          shift_id?: string | null
          staff_id?: string
          updated_at?: string
          updated_by?: string | null
          void_reason?: string | null
          voided?: boolean
          voided_at?: string | null
          voided_by?: string | null
          waived_at?: string | null
          waived_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "checkin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "membership"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_membership_type_id_fkey"
            columns: ["membership_type_id"]
            isOneToOne: false
            referencedRelation: "membership_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shift"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_waived_by_fkey"
            columns: ["waived_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      price: {
        Row: {
          active: boolean
          amount_rsd: number
          id: number
          is_discount_price: boolean
          membership_type_id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          amount_rsd: number
          id?: never
          is_discount_price?: boolean
          membership_type_id: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          amount_rsd?: number
          id?: never
          is_discount_price?: boolean
          membership_type_id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_membership_type_id_fkey"
            columns: ["membership_type_id"]
            isOneToOne: false
            referencedRelation: "membership_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      reserved_session: {
        Row: {
          amount_rsd: number
          checkin_id: string | null
          created_at: string
          created_by: string | null
          id: string
          member_id: string
          session_date: string
          settled: boolean
          settled_at: string | null
          settled_payment_id: string | null
          training_category_id: number
        }
        Insert: {
          amount_rsd: number
          checkin_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          member_id: string
          session_date: string
          settled?: boolean
          settled_at?: string | null
          settled_payment_id?: string | null
          training_category_id: number
        }
        Update: {
          amount_rsd?: number
          checkin_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          member_id?: string
          session_date?: string
          settled?: boolean
          settled_at?: string | null
          settled_payment_id?: string | null
          training_category_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "reserved_session_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "checkin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserved_session_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserved_session_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserved_session_settled_payment_id_fkey"
            columns: ["settled_payment_id"]
            isOneToOne: false
            referencedRelation: "payment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserved_session_training_category_id_fkey"
            columns: ["training_category_id"]
            isOneToOne: false
            referencedRelation: "training_category"
            referencedColumns: ["id"]
          },
        ]
      }
      session_log: {
        Row: {
          checkin_id: string | null
          created_at: string
          id: string
          member_id: string
          membership_id: string | null
          session_date: string
          trainer_id: string | null
          training_category_id: number
        }
        Insert: {
          checkin_id?: string | null
          created_at?: string
          id?: string
          member_id: string
          membership_id?: string | null
          session_date: string
          trainer_id?: string | null
          training_category_id: number
        }
        Update: {
          checkin_id?: string | null
          created_at?: string
          id?: string
          member_id?: string
          membership_id?: string | null
          session_date?: string
          trainer_id?: string | null
          training_category_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "session_log_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "checkin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_log_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "membership"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_log_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_log_training_category_id_fkey"
            columns: ["training_category_id"]
            isOneToOne: false
            referencedRelation: "training_category"
            referencedColumns: ["id"]
          },
        ]
      }
      shift: {
        Row: {
          created_at: string
          ended_at: string | null
          ended_reason: Database["public"]["Enums"]["shift_end_reason"] | null
          id: string
          staff_id: string
          started_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          ended_reason?: Database["public"]["Enums"]["shift_end_reason"] | null
          id?: string
          staff_id: string
          started_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          ended_reason?: Database["public"]["Enums"]["shift_end_reason"] | null
          id?: string
          staff_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          active: boolean
          created_at: string
          id: string
          recovery_email: string | null
          role: Database["public"]["Enums"]["staff_role"]
          updated_at: string
          username: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id: string
          recovery_email?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
          username: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          recovery_email?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      training_category: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: number
          is_trainer_based: boolean
          label: string
          per_trainee: boolean
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: never
          is_trainer_based?: boolean
          label: string
          per_trainee?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: never
          is_trainer_based?: boolean
          label?: string
          per_trainee?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_category_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auto_close_shifts: { Args: never; Returns: undefined }
      business_today: { Args: never; Returns: string }
      capture_daily_price: {
        Args: { p_training_category_id: number }
        Returns: number
      }
      cleanup_login_attempts: { Args: never; Returns: undefined }
      create_checkin: {
        Args: {
          p_allow_expired_override?: boolean
          p_business_date?: string
          p_is_fitpass?: boolean
          p_is_group_fitpass?: boolean
          p_key_no?: number
          p_member_id?: string
          p_trainer_id?: string
          p_training_category_id?: number
          p_with_trainer?: boolean
        }
        Returns: string
      }
      current_staff: {
        Args: never
        Returns: {
          active: boolean
          created_at: string
          id: string
          recovery_email: string | null
          role: Database["public"]["Enums"]["staff_role"]
          updated_at: string
          username: string
        }
        SetofOptions: {
          from: "*"
          to: "staff"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      end_shift: { Args: never; Returns: undefined }
      handover_shift: { Args: never; Returns: undefined }
      has_open_shift: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      offered_membership_price: {
        Args: { p_member_id: string; p_membership_type_id: number }
        Returns: number
      }
      open_or_resume_shift: { Args: never; Returns: string }
      pause_membership: {
        Args: { p_membership_id: string }
        Returns: undefined
      }
      promote_memberships: { Args: never; Returns: undefined }
      record_payment: {
        Args: {
          p_amount_rsd?: number
          p_business_date?: string
          p_checkin_id?: string
          p_custom_reason?: string
          p_is_custom_price?: boolean
          p_member_id: string
          p_membership_type_id?: number
          p_settle_reserved_ids?: string[]
          p_start_mode?: Database["public"]["Enums"]["membership_start_mode"]
        }
        Returns: string
      }
      resume_membership: {
        Args: { p_membership_id: string }
        Returns: undefined
      }
      search_members: {
        Args: {
          include_archived?: boolean
          lim?: number
          off?: number
          q?: string
        }
        Returns: {
          archived: boolean
          comment: string
          created_at: string
          discount_flag: boolean
          first_name: string
          id: string
          last_name: string
          member_no: number
          membership_end_date: string
          membership_is_time_based: boolean
          membership_label: string
          membership_sessions_left: number
          membership_status: Database["public"]["Enums"]["membership_status"]
          phone: string
          total_count: number
        }[]
      }
      void_checkin: { Args: { p_checkin_id: string }; Returns: undefined }
      void_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      membership_start_mode: "payment" | "first_visit"
      membership_status: "aktivna" | "istekla" | "pauzirana" | "zakazana"
      payment_kind: "membership" | "debt_settlement" | "fitpass_surcharge"
      shift_end_reason: "logout" | "switch" | "auto_close" | "inactivity"
      staff_role: "user" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      membership_start_mode: ["payment", "first_visit"],
      membership_status: ["aktivna", "istekla", "pauzirana", "zakazana"],
      payment_kind: ["membership", "debt_settlement", "fitpass_surcharge"],
      shift_end_reason: ["logout", "switch", "auto_close", "inactivity"],
      staff_role: ["user", "admin"],
    },
  },
} as const

// App-level aliases (used across the codebase)
export type StaffRole = Enums<"staff_role">
export type MembershipStatus = Enums<"membership_status">
export type MembershipStartMode = Enums<"membership_start_mode">
export type PaymentKind = Enums<"payment_kind">
export type ShiftEndReason = Enums<"shift_end_reason">

export type Staff = Tables<"staff">
export type Shift = Tables<"shift">
export type Member = Tables<"member">
export type TrainingCategory = Tables<"training_category">
export type MembershipType = Tables<"membership_type">
export type Price = Tables<"price">
export type Membership = Tables<"membership">
export type Payment = Tables<"payment">
export type Checkin = Tables<"checkin">
export type SessionLog = Tables<"session_log">
export type ReservedSession = Tables<"reserved_session">
export type GymKey = Tables<"gym_key">
