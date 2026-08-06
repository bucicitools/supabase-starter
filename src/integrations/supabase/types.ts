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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      cash_entries: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          created_by_name: string | null
          id: string
          is_reset: boolean
          note: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["cash_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          is_reset?: boolean
          note?: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["cash_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          is_reset?: boolean
          note?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["cash_type"]
        }
        Relationships: [
          {
            foreignKeyName: "cash_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          feature_key: string
          id: string
          is_hidden: boolean
          is_locked: boolean
          note: string | null
          updated_at: string
        }
        Insert: {
          feature_key: string
          id?: string
          is_hidden?: boolean
          is_locked?: boolean
          note?: string | null
          updated_at?: string
        }
        Update: {
          feature_key?: string
          id?: string
          is_hidden?: boolean
          is_locked?: boolean
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hpp_recipes: {
        Row: {
          created_at: string
          hpp: number
          id: string
          ingredients: Json
          labor: number
          overhead: number
          product_id: string | null
          product_name: string
          suggested_price: number | null
          tenant_id: string
          updated_at: string
          yield_qty: number
        }
        Insert: {
          created_at?: string
          hpp?: number
          id?: string
          ingredients?: Json
          labor?: number
          overhead?: number
          product_id?: string | null
          product_name: string
          suggested_price?: number | null
          tenant_id: string
          updated_at?: string
          yield_qty?: number
        }
        Update: {
          created_at?: string
          hpp?: number
          id?: string
          ingredients?: Json
          labor?: number
          overhead?: number
          product_id?: string | null
          product_name?: string
          suggested_price?: number | null
          tenant_id?: string
          updated_at?: string
          yield_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "hpp_recipes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      info_posts: {
        Row: {
          content: string
          created_at: string
          id: string
          is_pinned: boolean
          link: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          link?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          link?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      licenses: {
        Row: {
          batch: string | null
          code: string
          created_at: string
          id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          batch?: string | null
          code: string
          created_at?: string
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          batch?: string | null
          code?: string
          created_at?: string
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licenses_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          cost: number | null
          created_at: string
          id: string
          image_url: string | null
          low_stock_threshold: number
          name: string
          price: number
          sku: string | null
          stock: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          cost?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          name: string
          price?: number
          sku?: string | null
          stock?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          cost?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          name?: string
          price?: number
          sku?: string | null
          stock?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          allowed_tool: string | null
          allowed_tools: string[]
          created_at: string
          email: string
          full_name: string
          id: string
          tenant_id: string | null
          tenant_role_id: string | null
          updated_at: string
        }
        Insert: {
          allowed_tool?: string | null
          allowed_tools?: string[]
          created_at?: string
          email: string
          full_name: string
          id: string
          tenant_id?: string | null
          tenant_role_id?: string | null
          updated_at?: string
        }
        Update: {
          allowed_tool?: string | null
          allowed_tools?: string[]
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          tenant_id?: string | null
          tenant_role_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          created_at: string
          id: string
          kind: string
          min_qty: number
          name: string
          note: string | null
          qty: number
          supplier: string | null
          tenant_id: string
          unit: string
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          min_qty?: number
          name: string
          note?: string | null
          qty?: number
          supplier?: string | null
          tenant_id: string
          unit?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          min_qty?: number
          name?: string
          note?: string | null
          qty?: number
          supplier?: string | null
          tenant_id?: string
          unit?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by_name: string | null
          direction: string
          id: string
          item_id: string
          note: string | null
          qty: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by_name?: string | null
          direction: string
          id?: string
          item_id: string
          note?: string | null
          qty: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by_name?: string | null
          direction?: string
          id?: string
          item_id?: string
          note?: string | null
          qty?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_roles: {
        Row: {
          created_at: string
          id: string
          name: string
          permissions: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          permissions?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          permissions?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          business_name: string
          created_at: string
          default_tax: number
          id: string
          is_active: boolean
          is_demo: boolean
          license_code: string | null
          owner_id: string | null
          owner_name: string
          receipt_address: string | null
          receipt_extra: string | null
          receipt_footer: string | null
          receipt_header: string | null
          receipt_logo_url: string | null
          receipt_phone: string | null
          receipt_qris_url: string | null
          updated_at: string
        }
        Insert: {
          business_name: string
          created_at?: string
          default_tax?: number
          id?: string
          is_active?: boolean
          is_demo?: boolean
          license_code?: string | null
          owner_id?: string | null
          owner_name: string
          receipt_address?: string | null
          receipt_extra?: string | null
          receipt_footer?: string | null
          receipt_header?: string | null
          receipt_logo_url?: string | null
          receipt_phone?: string | null
          receipt_qris_url?: string | null
          updated_at?: string
        }
        Update: {
          business_name?: string
          created_at?: string
          default_tax?: number
          id?: string
          is_active?: boolean
          is_demo?: boolean
          license_code?: string | null
          owner_id?: string | null
          owner_name?: string
          receipt_address?: string | null
          receipt_extra?: string | null
          receipt_footer?: string | null
          receipt_header?: string | null
          receipt_logo_url?: string | null
          receipt_phone?: string | null
          receipt_qris_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transaction_items: {
        Row: {
          cost: number | null
          created_at: string
          id: string
          name: string
          price: number
          product_id: string | null
          qty: number
          tenant_id: string
          transaction_id: string
        }
        Insert: {
          cost?: number | null
          created_at?: string
          id?: string
          name: string
          price?: number
          product_id?: string | null
          qty?: number
          tenant_id: string
          transaction_id: string
        }
        Update: {
          cost?: number | null
          created_at?: string
          id?: string
          name?: string
          price?: number
          product_id?: string | null
          qty?: number
          tenant_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          cashier_id: string | null
          cashier_name: string | null
          change_amount: number
          code: string
          created_at: string
          customer_name: string | null
          debt_note: string | null
          discount_amount: number
          discount_is_percent: boolean
          discount_value: number
          due_date: string | null
          id: string
          note: string | null
          paid_amount: number
          paid_at: string | null
          payment_method: string | null
          status: Database["public"]["Enums"]["tx_status"]
          subtotal: number
          tax_amount: number
          tax_percent: number
          tenant_id: string
          total: number
          updated_at: string
          void_note: string | null
        }
        Insert: {
          cashier_id?: string | null
          cashier_name?: string | null
          change_amount?: number
          code: string
          created_at?: string
          customer_name?: string | null
          debt_note?: string | null
          discount_amount?: number
          discount_is_percent?: boolean
          discount_value?: number
          due_date?: string | null
          id?: string
          note?: string | null
          paid_amount?: number
          paid_at?: string | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          subtotal?: number
          tax_amount?: number
          tax_percent?: number
          tenant_id: string
          total?: number
          updated_at?: string
          void_note?: string | null
        }
        Update: {
          cashier_id?: string | null
          cashier_name?: string | null
          change_amount?: number
          code?: string
          created_at?: string
          customer_name?: string | null
          debt_note?: string | null
          discount_amount?: number
          discount_is_percent?: boolean
          discount_value?: number
          due_date?: string | null
          id?: string
          note?: string | null
          paid_amount?: number
          paid_at?: string | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          subtotal?: number
          tax_amount?: number
          tax_percent?: number
          tenant_id?: string
          total?: number
          updated_at?: string
          void_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_tenant: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "super_admin" | "owner" | "member"
      cash_type: "fill" | "in" | "out"
      tx_status: "paid" | "unpaid" | "void"
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
    Enums: {
      app_role: ["super_admin", "owner", "member"],
      cash_type: ["fill", "in", "out"],
      tx_status: ["paid", "unpaid", "void"],
    },
  },
} as const
