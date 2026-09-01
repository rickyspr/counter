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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      exercises: {
        Row: {
          created_at: string
          id: string
          muscle_group: string | null
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          muscle_group?: string | null
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          muscle_group?: string | null
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      follows: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          pair_high: string | null
          pair_low: string | null
          requester_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          pair_high?: string | null
          pair_low?: string | null
          requester_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          pair_high?: string | null
          pair_low?: string | null
          requester_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          bio: string | null
          birth_date: string | null
          body_weight_kg: number | null
          created_at: string
          display_name: string | null
          height_cm: number | null
          home_gym: string | null
          id: string
          unit: string
          unit_chosen_at: string | null
        }
        Insert: {
          avatar_path?: string | null
          bio?: string | null
          birth_date?: string | null
          body_weight_kg?: number | null
          created_at?: string
          display_name?: string | null
          height_cm?: number | null
          home_gym?: string | null
          id: string
          unit?: string
          unit_chosen_at?: string | null
        }
        Update: {
          avatar_path?: string | null
          bio?: string | null
          birth_date?: string | null
          body_weight_kg?: number | null
          created_at?: string
          display_name?: string | null
          height_cm?: number | null
          home_gym?: string | null
          id?: string
          unit?: string
          unit_chosen_at?: string | null
        }
        Relationships: []
      }
      sets: {
        Row: {
          created_at: string
          id: string
          reps: number
          set_nr: number
          weight_kg: number
          workout_exercise_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reps: number
          set_nr: number
          weight_kg: number
          workout_exercise_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reps?: number
          set_nr?: number
          weight_kg?: number
          workout_exercise_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sets_workout_exercise_id_fkey"
            columns: ["workout_exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_exercises: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          order_index: number
          workout_id: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          order_index: number
          workout_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          order_index?: number
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercises_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_kudos: {
        Row: {
          created_at: string
          id: string
          user_id: string
          workout_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          workout_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_kudos_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_media: {
        Row: {
          added_at: string
          created_at: string
          duration_ms: number | null
          height: number | null
          id: string
          media_type: string
          storage_path: string
          width: number | null
          workout_id: string
        }
        Insert: {
          added_at?: string
          created_at?: string
          duration_ms?: number | null
          height?: number | null
          id?: string
          media_type: string
          storage_path: string
          width?: number | null
          workout_id: string
        }
        Update: {
          added_at?: string
          created_at?: string
          duration_ms?: number | null
          height?: number | null
          id?: string
          media_type?: string
          storage_path?: string
          width?: number | null
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_media_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          name: string | null
          note: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          name?: string | null
          note?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          name?: string | null
          note?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      are_mutual_friends: { Args: { a: string; b: string }; Returns: boolean }
      can_view_workout: { Args: { p_workout_id: string }; Returns: boolean }
      get_exercise_personal_bests: {
        Args: never
        Returns: {
          best_e1rm_kg: number
          exercise_id: string
          exercise_name: string
          heaviest_set_kg: number
          workout_count: number
        }[]
      }
      get_exercise_progression: {
        Args: { p_exercise_id: string }
        Returns: {
          best_e1rm_kg: number
          top_weight_kg: number
          workout_started_at: string
        }[]
      }
      get_weekly_training_series: {
        Args: never
        Returns: {
          volume_kg: number
          week_start: string
          workout_count: number
        }[]
      }
      get_friend_training_stats: {
        Args: { p_user_id: string }
        Returns: {
          total_minutes: number
          total_volume_kg: number
          workout_count: number
        }[]
      }
      get_training_stats: {
        Args: never
        Returns: {
          total_minutes: number
          total_volume_kg: number
          workout_count: number
        }[]
      }
      list_friends: {
        Args: never
        Returns: {
          avatar_path: string
          bio: string
          display_name: string
          friends_since: string
          home_gym: string
          id: string
        }[]
      }
      list_pending_requests: {
        Args: never
        Returns: {
          created_at: string
          direction: string
          display_name: string
          follow_id: string
          other_id: string
        }[]
      }
      search_profiles: {
        Args: { query: string }
        Returns: {
          display_name: string
          id: string
          relationship: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
