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
  public: {
    Tables: {
      analyses: {
        Row: {
          analysis_date: string
          conformity: number
          created_at: string
          deleted_at: string | null
          id: string
          laboratory_id: string | null
          member_id: string | null
          observations_html: string | null
          sample_code: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["analysis_type"]
          updated_at: string
        }
        Insert: {
          analysis_date?: string
          conformity?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          laboratory_id?: string | null
          member_id?: string | null
          observations_html?: string | null
          sample_code?: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["analysis_type"]
          updated_at?: string
        }
        Update: {
          analysis_date?: string
          conformity?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          laboratory_id?: string | null
          member_id?: string | null
          observations_html?: string | null
          sample_code?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["analysis_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "analyses_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analyses_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analyses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_attachments: {
        Row: {
          analysis_id: string
          id: string
          mime: string | null
          name: string
          size: number | null
          url: string
        }
        Insert: {
          analysis_id: string
          id?: string
          mime?: string | null
          name: string
          size?: number | null
          url: string
        }
        Update: {
          analysis_id?: string
          id?: string
          mime?: string | null
          name?: string
          size?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_attachments_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          reason: string | null
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          reason?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          reason?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          locality: string | null
          name: string
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          locality?: string | null
          name: string
          phone?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          locality?: string | null
          name?: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_items: {
        Row: {
          dispatch_id: string
          id: string
          production_id: string | null
          quantity_kg: number
          recipe_id: string
        }
        Insert: {
          dispatch_id: string
          id?: string
          production_id?: string | null
          quantity_kg: number
          recipe_id: string
        }
        Update: {
          dispatch_id?: string
          id?: string
          production_id?: string | null
          quantity_kg?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_items_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_items_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatches: {
        Row: {
          created_at: string
          customer_id: string
          deleted_at: string | null
          dispatch_date: string
          establishment_id: string | null
          id: string
          status: string
          tenant_id: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          dispatch_date: string
          establishment_id?: string | null
          id?: string
          status?: string
          tenant_id: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          dispatch_date?: string
          establishment_id?: string | null
          id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatches_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatches_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatches_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          enabled: boolean
          html: string
          key: string
          subject: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          html: string
          key: string
          subject: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          html?: string
          key?: string
          subject?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      establishments: {
        Row: {
          address: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_default: boolean
          locality: string | null
          municipal_permit_status: string | null
          name: string
          rne_attachment_url: string | null
          rne_expiry: string | null
          rne_number: string | null
          ruca_expiry: string | null
          ruca_number: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          locality?: string | null
          municipal_permit_status?: string | null
          name: string
          rne_attachment_url?: string | null
          rne_expiry?: string | null
          rne_number?: string | null
          ruca_expiry?: string | null
          ruca_number?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          locality?: string | null
          municipal_permit_status?: string | null
          name?: string
          rne_attachment_url?: string | null
          rne_expiry?: string | null
          rne_number?: string | null
          ruca_expiry?: string | null
          ruca_number?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "establishments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          default_enabled: boolean
          description: string | null
          id: string
          key: string
        }
        Insert: {
          default_enabled?: boolean
          description?: string | null
          id?: string
          key: string
        }
        Update: {
          default_enabled?: boolean
          description?: string | null
          id?: string
          key?: string
        }
        Relationships: []
      }
      form_submissions: {
        Row: {
          corrective_action: string | null
          corrects_submission_id: string | null
          created_at: string
          evidence_urls: string[]
          id: string
          status: Database["public"]["Enums"]["submission_status"]
          submitted_at: string
          submitted_by_member_id: string | null
          template_id: string
          tenant_id: string
          values: Json
        }
        Insert: {
          corrective_action?: string | null
          corrects_submission_id?: string | null
          created_at?: string
          evidence_urls?: string[]
          id?: string
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string
          submitted_by_member_id?: string | null
          template_id: string
          tenant_id: string
          values: Json
        }
        Update: {
          corrective_action?: string | null
          corrects_submission_id?: string | null
          created_at?: string
          evidence_urls?: string[]
          id?: string
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string
          submitted_by_member_id?: string | null
          template_id?: string
          tenant_id?: string
          values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_corrects_submission_id_fkey"
            columns: ["corrects_submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_submitted_by_member_id_fkey"
            columns: ["submitted_by_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          action_on_fail: Json | null
          created_at: string
          deleted_at: string | null
          fields: Json
          frequency: Json
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["form_kind"]
          name: string
          requires_signature: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action_on_fail?: Json | null
          created_at?: string
          deleted_at?: string | null
          fields?: Json
          frequency?: Json
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["form_kind"]
          name: string
          requires_signature?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action_on_fail?: Json | null
          created_at?: string
          deleted_at?: string | null
          fields?: Json
          frequency?: Json
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["form_kind"]
          name?: string
          requires_signature?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_families: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          image_url: string | null
          name: string
          sort: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          name: string
          sort?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          name?: string
          sort?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_families_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          created_at: string
          default_shelf_days: number | null
          deleted_at: string | null
          description: string | null
          family_id: string | null
          id: string
          image_url: string | null
          is_perishable: boolean
          low_stock_threshold: number | null
          name: string
          tenant_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_shelf_days?: number | null
          deleted_at?: string | null
          description?: string | null
          family_id?: string | null
          id?: string
          image_url?: string | null
          is_perishable?: boolean
          low_stock_threshold?: number | null
          name: string
          tenant_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_shelf_days?: number | null
          deleted_at?: string | null
          description?: string | null
          family_id?: string | null
          id?: string
          image_url?: string | null
          is_perishable?: boolean
          low_stock_threshold?: number | null
          name?: string
          tenant_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "ingredient_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      laboratories: {
        Row: {
          contact: Json
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          contact?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          contact?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "laboratories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      localities: {
        Row: {
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "localities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_code_templates: {
        Row: {
          id: string
          is_default: boolean
          name: string
          tenant_id: string
          tokens: Json
        }
        Insert: {
          id?: string
          is_default?: boolean
          name: string
          tenant_id: string
          tokens?: Json
        }
        Update: {
          id?: string
          is_default?: boolean
          name?: string
          tenant_id?: string
          tokens?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lot_code_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      measure_units: {
        Row: {
          abbr: string
          id: string
          name: string
          tenant_id: string | null
        }
        Insert: {
          abbr: string
          id?: string
          name: string
          tenant_id?: string | null
        }
        Update: {
          abbr?: string
          id?: string
          name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "measure_units_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          photo_url: string | null
          pin_hash: string
          position: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          photo_url?: string | null
          pin_hash: string
          position?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          photo_url?: string | null
          pin_hash?: string
          position?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_webhooks: {
        Row: {
          created_at: string
          deleted_at: string | null
          events: string[]
          id: string
          is_active: boolean
          last_delivery_at: string | null
          last_delivery_status: number | null
          secret: string
          tenant_id: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          events?: string[]
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          last_delivery_status?: number | null
          secret: string
          tenant_id: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          events?: string[]
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          last_delivery_status?: number | null
          secret?: string
          tenant_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          created_at: string
          id: string
          payload: Json
          processed_at: string | null
          provider: Database["public"]["Enums"]["billing_provider"]
          provider_event_id: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          payload: Json
          processed_at?: string | null
          provider: Database["public"]["Enums"]["billing_provider"]
          provider_event_id: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: Database["public"]["Enums"]["billing_provider"]
          provider_event_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key: string
          limits: Json
          monthly_price_ars: number | null
          monthly_price_usd: number | null
          name: string
          updated_at: string
          yearly_price_ars: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          limits?: Json
          monthly_price_ars?: number | null
          monthly_price_usd?: number | null
          name: string
          updated_at?: string
          yearly_price_ars?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          limits?: Json
          monthly_price_ars?: number | null
          monthly_price_usd?: number | null
          name?: string
          updated_at?: string
          yearly_price_ars?: number | null
        }
        Relationships: []
      }
      production_counters: {
        Row: {
          last_value: number
          tenant_id: string
        }
        Insert: {
          last_value?: number
          tenant_id: string
        }
        Update: {
          last_value?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      production_inputs: {
        Row: {
          id: string
          ingredient_id: string
          is_substitute: boolean
          production_id: string
          required_qty: number
          source_ingredient_id: string | null
          stock_entry_id: string | null
          taken_qty: number
        }
        Insert: {
          id?: string
          ingredient_id: string
          is_substitute?: boolean
          production_id: string
          required_qty: number
          source_ingredient_id?: string | null
          stock_entry_id?: string | null
          taken_qty?: number
        }
        Update: {
          id?: string
          ingredient_id?: string
          is_substitute?: boolean
          production_id?: string
          required_qty?: number
          source_ingredient_id?: string | null
          stock_entry_id?: string | null
          taken_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_inputs_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_inputs_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_inputs_source_ingredient_id_fkey"
            columns: ["source_ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_inputs_stock_entry_id_fkey"
            columns: ["stock_entry_id"]
            isOneToOne: false
            referencedRelation: "stock_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      production_reserves: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          ingredient_id: string
          quantity: number
          stock_entry_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          ingredient_id: string
          quantity: number
          stock_entry_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          ingredient_id?: string
          quantity?: number
          stock_entry_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_reserves_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_reserves_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_reserves_stock_entry_id_fkey"
            columns: ["stock_entry_id"]
            isOneToOne: false
            referencedRelation: "stock_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_reserves_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      productions: {
        Row: {
          aging_snapshot: number | null
          code: string
          created_at: string
          deleted_at: string | null
          establishment_id: string | null
          id: string
          manager_member_id: string | null
          notes: string | null
          packaging_date: string | null
          product_expiry_date: string | null
          product_lot_number: string | null
          production_date: string
          quantity_kg: number | null
          recipe_id: string
          shelf_life_snapshot: number | null
          status: Database["public"]["Enums"]["production_status"]
          tenant_id: string
          total_cost: number | null
          updated_at: string
        }
        Insert: {
          aging_snapshot?: number | null
          code: string
          created_at?: string
          deleted_at?: string | null
          establishment_id?: string | null
          id?: string
          manager_member_id?: string | null
          notes?: string | null
          packaging_date?: string | null
          product_expiry_date?: string | null
          product_lot_number?: string | null
          production_date: string
          quantity_kg?: number | null
          recipe_id: string
          shelf_life_snapshot?: number | null
          status?: Database["public"]["Enums"]["production_status"]
          tenant_id: string
          total_cost?: number | null
          updated_at?: string
        }
        Update: {
          aging_snapshot?: number | null
          code?: string
          created_at?: string
          deleted_at?: string | null
          establishment_id?: string | null
          id?: string
          manager_member_id?: string | null
          notes?: string | null
          packaging_date?: string | null
          product_expiry_date?: string | null
          product_lot_number?: string | null
          production_date?: string
          quantity_kg?: number | null
          recipe_id?: string
          shelf_life_snapshot?: number | null
          status?: Database["public"]["Enums"]["production_status"]
          tenant_id?: string
          total_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "productions_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_manager_member_id_fkey"
            columns: ["manager_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      public_traces: {
        Row: {
          created_at: string
          id: string
          payload: Json
          production_id: string
          qr_config: Json
          slug: string
          tenant_id: string
          views_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          payload: Json
          production_id: string
          qr_config?: Json
          slug: string
          tenant_id: string
          views_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          production_id?: string
          qr_config?: Json
          slug?: string
          tenant_id?: string
          views_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "public_traces_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_traces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_groups: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          image_url: string | null
          name: string
          sort: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          name: string
          sort?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          name?: string
          sort?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          id: string
          ingredient_id: string
          is_substitute: boolean
          quantity: number
          recipe_id: string
          source_ingredient_id: string | null
          unit: string
        }
        Insert: {
          id?: string
          ingredient_id: string
          is_substitute?: boolean
          quantity: number
          recipe_id: string
          source_ingredient_id?: string | null
          unit: string
        }
        Update: {
          id?: string
          ingredient_id?: string
          is_substitute?: boolean
          quantity?: number
          recipe_id?: string
          source_ingredient_id?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_source_ingredient_id_fkey"
            columns: ["source_ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          aging_days: number
          bpm_attachment_url: string | null
          category: Database["public"]["Enums"]["food_category"]
          commercial_name: string | null
          created_at: string
          declaration_unit: string | null
          deleted_at: string | null
          description: string | null
          front_labels: string[]
          group_id: string | null
          household_measure: string | null
          id: string
          image_url: string | null
          nutrition: Json
          packaging_delay_type: Database["public"]["Enums"]["packaging_delay"]
          product_type: Database["public"]["Enums"]["product_type"]
          rnpa_attachment_url: string | null
          rnpa_exempt: boolean
          rnpa_exempt_reason: string | null
          rnpa_expiry: string | null
          rnpa_number: string | null
          shelf_life_days: number
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          aging_days?: number
          bpm_attachment_url?: string | null
          category?: Database["public"]["Enums"]["food_category"]
          commercial_name?: string | null
          created_at?: string
          declaration_unit?: string | null
          deleted_at?: string | null
          description?: string | null
          front_labels?: string[]
          group_id?: string | null
          household_measure?: string | null
          id?: string
          image_url?: string | null
          nutrition?: Json
          packaging_delay_type?: Database["public"]["Enums"]["packaging_delay"]
          product_type?: Database["public"]["Enums"]["product_type"]
          rnpa_attachment_url?: string | null
          rnpa_exempt?: boolean
          rnpa_exempt_reason?: string | null
          rnpa_expiry?: string | null
          rnpa_number?: string | null
          shelf_life_days?: number
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          aging_days?: number
          bpm_attachment_url?: string | null
          category?: Database["public"]["Enums"]["food_category"]
          commercial_name?: string | null
          created_at?: string
          declaration_unit?: string | null
          deleted_at?: string | null
          description?: string | null
          front_labels?: string[]
          group_id?: string | null
          household_measure?: string | null
          id?: string
          image_url?: string | null
          nutrition?: Json
          packaging_delay_type?: Database["public"]["Enums"]["packaging_delay"]
          product_type?: Database["public"]["Enums"]["product_type"]
          rnpa_attachment_url?: string | null
          rnpa_exempt?: boolean
          rnpa_exempt_reason?: string | null
          rnpa_expiry?: string | null
          rnpa_number?: string | null
          shelf_life_days?: number
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "recipe_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      report_attachments: {
        Row: {
          id: string
          mime: string | null
          name: string
          report_id: string
          size: number | null
          url: string
        }
        Insert: {
          id?: string
          mime?: string | null
          name: string
          report_id: string
          size?: number | null
          url: string
        }
        Update: {
          id?: string
          mime?: string | null
          name?: string
          report_id?: string
          size?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_attachments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          content_html: string
          created_at: string
          deleted_at: string | null
          id: string
          importance: number
          member_id: string | null
          notify_member_ids: string[]
          report_date: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          content_html: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          importance?: number
          member_id?: string | null
          notify_member_ids?: string[]
          report_date?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          content_html?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          importance?: number
          member_id?: string | null
          notify_member_ids?: string[]
          report_date?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_entries: {
        Row: {
          created_at: string
          currency: string
          deleted_at: string | null
          establishment_id: string | null
          expiry_date: string | null
          frozen_extra_days: number
          id: string
          ingredient_id: string
          invoice_url: string | null
          is_frozen: boolean
          is_internal_use: boolean
          lot_number: string
          manufacture_date: string | null
          no_traceability: boolean
          quantity: number
          remaining_quantity: number
          supplier_id: string | null
          tenant_id: string
          unit: string
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          deleted_at?: string | null
          establishment_id?: string | null
          expiry_date?: string | null
          frozen_extra_days?: number
          id?: string
          ingredient_id: string
          invoice_url?: string | null
          is_frozen?: boolean
          is_internal_use?: boolean
          lot_number: string
          manufacture_date?: string | null
          no_traceability?: boolean
          quantity: number
          remaining_quantity: number
          supplier_id?: string | null
          tenant_id: string
          unit: string
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          deleted_at?: string | null
          establishment_id?: string | null
          expiry_date?: string | null
          frozen_extra_days?: number
          id?: string
          ingredient_id?: string
          invoice_url?: string | null
          is_frozen?: boolean
          is_internal_use?: boolean
          lot_number?: string
          manufacture_date?: string | null
          no_traceability?: boolean
          quantity?: number
          remaining_quantity?: number
          supplier_id?: string | null
          tenant_id?: string
          unit?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_entries_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_entries_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_entries_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          ingredient_id: string
          production_id: string | null
          quantity: number
          reason: string | null
          stock_entry_id: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["stock_movement_type"]
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ingredient_id: string
          production_id?: string | null
          quantity: number
          reason?: string | null
          stock_entry_id?: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["stock_movement_type"]
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ingredient_id?: string
          production_id?: string | null
          quantity?: number
          reason?: string | null
          stock_entry_id?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["stock_movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_production_fk"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_stock_entry_id_fkey"
            columns: ["stock_entry_id"]
            isOneToOne: false
            referencedRelation: "stock_entries"
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
      subscriptions: {
        Row: {
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          provider: Database["public"]["Enums"]["billing_provider"]
          provider_subscription_id: string | null
          status: Database["public"]["Enums"]["tenant_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          provider?: Database["public"]["Enums"]["billing_provider"]
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["tenant_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          provider?: Database["public"]["Enums"]["billing_provider"]
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["tenant_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          contact: Json
          created_at: string
          cuit: string | null
          deleted_at: string | null
          id: string
          name: string
          rne_attachment_url: string | null
          rne_expiry: string | null
          rne_number: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contact?: Json
          created_at?: string
          cuit?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          rne_attachment_url?: string | null
          rne_expiry?: string | null
          rne_number?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          contact?: Json
          created_at?: string
          cuit?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          rne_attachment_url?: string | null
          rne_expiry?: string | null
          rne_number?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_email_smtp: {
        Row: {
          from_email: string
          from_name: string
          hostname: string
          id: number
          password: string
          port: number
          secure: boolean
          updated_at: string
          username: string
        }
        Insert: {
          from_email: string
          from_name: string
          hostname: string
          id?: number
          password: string
          port?: number
          secure?: boolean
          updated_at?: string
          username: string
        }
        Update: {
          from_email?: string
          from_name?: string
          hostname?: string
          id?: number
          password?: string
          port?: number
          secure?: boolean
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      system_emails: {
        Row: {
          created_at: string
          error_message: string | null
          html_content: string
          id: string
          recipient: string
          sent_at: string | null
          status: string
          subject: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          html_content: string
          id?: string
          recipient: string
          sent_at?: string | null
          status?: string
          subject: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          html_content?: string
          id?: string
          recipient?: string
          sent_at?: string | null
          status?: string
          subject?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_emails_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_email_templates: {
        Row: {
          html: string
          key: string
          subject: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          html: string
          key: string
          subject: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          html?: string
          key?: string
          subject?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_email_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_branding: {
        Row: {
          accent: string
          address: string | null
          cuit: string | null
          legal_name: string | null
          logo_url: string | null
          phone: string | null
          sello_abr_enabled: boolean
          tenant_id: string
          trace_page_config: Json
          updated_at: string
        }
        Insert: {
          accent?: string
          address?: string | null
          cuit?: string | null
          legal_name?: string | null
          logo_url?: string | null
          phone?: string | null
          sello_abr_enabled?: boolean
          tenant_id: string
          trace_page_config?: Json
          updated_at?: string
        }
        Update: {
          accent?: string
          address?: string | null
          cuit?: string | null
          legal_name?: string | null
          logo_url?: string | null
          phone?: string | null
          sello_abr_enabled?: boolean
          tenant_id?: string
          trace_page_config?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_branding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_feature_flags: {
        Row: {
          configured_at: string
          configured_by: string | null
          enabled: boolean
          feature_flag_id: string
          tenant_id: string
        }
        Insert: {
          configured_at?: string
          configured_by?: string | null
          enabled?: boolean
          feature_flag_id: string
          tenant_id: string
        }
        Update: {
          configured_at?: string
          configured_by?: string | null
          enabled?: boolean
          feature_flag_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_feature_flags_configured_by_fkey"
            columns: ["configured_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_feature_flags_feature_flag_id_fkey"
            columns: ["feature_flag_id"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_feature_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_operating_profiles: {
        Row: {
          compliance_frameworks: string[]
          country: string
          created_at: string
          currency: string
          date_format: string
          default_tax_rate: number
          enabled_modules: Json
          label_languages: string[]
          locale: string
          measurement_system: string
          tax_id_label: string
          tax_id_value: string | null
          tax_label: string
          temperature_unit: string
          tenant_id: string
          timezone: string
          traceability_config: Json
          updated_at: string
          volume_unit: string
          weight_unit: string
        }
        Insert: {
          compliance_frameworks?: string[]
          country?: string
          created_at?: string
          currency?: string
          date_format?: string
          default_tax_rate?: number
          enabled_modules?: Json
          label_languages?: string[]
          locale?: string
          measurement_system?: string
          tax_id_label?: string
          tax_id_value?: string | null
          tax_label?: string
          temperature_unit?: string
          tenant_id: string
          timezone?: string
          traceability_config?: Json
          updated_at?: string
          volume_unit?: string
          weight_unit?: string
        }
        Update: {
          compliance_frameworks?: string[]
          country?: string
          created_at?: string
          currency?: string
          date_format?: string
          default_tax_rate?: number
          enabled_modules?: Json
          label_languages?: string[]
          locale?: string
          measurement_system?: string
          tax_id_label?: string
          tax_id_value?: string | null
          tax_label?: string
          temperature_unit?: string
          tenant_id?: string
          timezone?: string
          traceability_config?: Json
          updated_at?: string
          volume_unit?: string
          weight_unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_operating_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_users: {
        Row: {
          avatar: string | null
          created_at: string
          display_name: string | null
          id: string
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          avatar?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          avatar?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          country: string
          created_at: string
          cuit: string | null
          deleted_at: string | null
          id: string
          industry: Database["public"]["Enums"]["tenant_industry"]
          name: string
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          cuit?: string | null
          deleted_at?: string | null
          id?: string
          industry?: Database["public"]["Enums"]["tenant_industry"]
          name: string
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          cuit?: string | null
          deleted_at?: string | null
          id?: string
          industry?: Database["public"]["Enums"]["tenant_industry"]
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          internal_level: string | null
          is_internal: boolean
          settings: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          internal_level?: string | null
          is_internal?: boolean
          settings?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          internal_level?: string | null
          is_internal?: boolean
          settings?: Json
          updated_at?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          capacity_kg: number | null
          created_at: string
          deleted_at: string | null
          id: string
          plate: string
          tenant_id: string
          updated_at: string
          ura_expiry: string | null
          ura_number: string | null
          uta_expiry: string | null
          uta_number: string | null
        }
        Insert: {
          capacity_kg?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          plate: string
          tenant_id: string
          updated_at?: string
          ura_expiry?: string | null
          ura_number?: string | null
          uta_expiry?: string | null
          uta_number?: string | null
        }
        Update: {
          capacity_kg?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          plate?: string
          tenant_id?: string
          updated_at?: string
          ura_expiry?: string | null
          ura_number?: string | null
          uta_expiry?: string | null
          uta_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      xlsx_imports: {
        Row: {
          actor_user_id: string | null
          created_at: string
          file_url: string | null
          id: string
          kind: string
          result: Json
          rows_error: number
          rows_ok: number
          rows_total: number
          tenant_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          kind?: string
          result?: Json
          rows_error?: number
          rows_ok?: number
          rows_total?: number
          tenant_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          kind?: string
          result?: Json
          rows_error?: number
          rows_ok?: number
          rows_total?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xlsx_imports_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xlsx_imports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_stock_entry: {
        Args: {
          p_delta: number
          p_entry_id: string
          p_reason: string
          p_type?: Database["public"]["Enums"]["stock_movement_type"]
        }
        Returns: number
      }
      complete_production: {
        Args: {
          p_inputs: Json
          p_manager_member_id?: string
          p_notes?: string
          p_product_lot_number?: string
          p_production_date: string
          p_quantity_kg: number
          p_recipe_id: string
        }
        Returns: Json
      }
      create_dispatch: {
        Args: {
          p_customer_id: string
          p_dispatch_date: string
          p_items: Json
          p_vehicle_id?: string
        }
        Returns: Json
      }
      create_stock_entry: {
        Args: {
          p_establishment_id?: string
          p_expiry_date?: string
          p_ingredient_id: string
          p_invoice_url?: string
          p_is_frozen?: boolean
          p_is_internal_use?: boolean
          p_lot_number: string
          p_manufacture_date?: string
          p_quantity: number
          p_supplier_id?: string
          p_unit: string
          p_unit_cost?: number
        }
        Returns: string
      }
      current_tenant_id: { Args: never; Returns: string }
      is_internal: { Args: never; Returns: boolean }
      submit_form: {
        Args: {
          p_corrective_action?: string
          p_corrects?: string
          p_member_id?: string
          p_pin?: string
          p_status?: string
          p_template_id: string
          p_values: Json
        }
        Returns: Json
      }
      verify_api_key: { Args: { p_key_hash: string }; Returns: Json }
    }
    Enums: {
      analysis_type:
        | "agua"
        | "alimentos"
        | "productos"
        | "superficies"
        | "ambiente"
        | "materia_prima"
        | "bebidas"
        | "otro"
      billing_cycle: "monthly" | "yearly"
      billing_provider: "mercadopago" | "stripe" | "paypal" | "manual"
      food_category:
        | "carnes"
        | "lacteos"
        | "panificados"
        | "conservas"
        | "bebidas"
        | "aditivos"
        | "otros"
      form_kind:
        | "temperatura"
        | "limpieza"
        | "plagas"
        | "recepcion_mp"
        | "capacitacion"
        | "pcc"
        | "custom"
      packaging_delay: "none" | "aging" | "freeze"
      product_type:
        | "solido"
        | "liquido"
        | "semisolido"
        | "polvo"
        | "concentrado"
      production_status: "draft" | "completed" | "voided"
      stock_movement_type:
        | "purchase"
        | "production"
        | "adjustment"
        | "loss"
        | "return"
        | "internal"
      submission_status: "ok" | "fail" | "corrected"
      tenant_industry:
        | "frigorifico"
        | "panaderia"
        | "lacteos"
        | "conservas"
        | "catering"
        | "otro"
      tenant_role: "owner" | "manager" | "operator" | "viewer"
      tenant_status: "trial" | "active" | "past_due" | "suspended" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
      analysis_type: [
        "agua",
        "alimentos",
        "productos",
        "superficies",
        "ambiente",
        "materia_prima",
        "bebidas",
        "otro",
      ],
      billing_cycle: ["monthly", "yearly"],
      billing_provider: ["mercadopago", "stripe", "paypal", "manual"],
      food_category: [
        "carnes",
        "lacteos",
        "panificados",
        "conservas",
        "bebidas",
        "aditivos",
        "otros",
      ],
      form_kind: [
        "temperatura",
        "limpieza",
        "plagas",
        "recepcion_mp",
        "capacitacion",
        "pcc",
        "custom",
      ],
      packaging_delay: ["none", "aging", "freeze"],
      product_type: ["solido", "liquido", "semisolido", "polvo", "concentrado"],
      production_status: ["draft", "completed", "voided"],
      stock_movement_type: [
        "purchase",
        "production",
        "adjustment",
        "loss",
        "return",
        "internal",
      ],
      submission_status: ["ok", "fail", "corrected"],
      tenant_industry: [
        "frigorifico",
        "panaderia",
        "lacteos",
        "conservas",
        "catering",
        "otro",
      ],
      tenant_role: ["owner", "manager", "operator", "viewer"],
      tenant_status: ["trial", "active", "past_due", "suspended", "cancelled"],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const
