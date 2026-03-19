export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type Database = {
  public: {
    Tables: {
      agents: {
        Row: {
          id: string
          user_id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          id: string
          user_id: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          status?: string
          updated_at?: string
        }
      }
      actions: {
        Row: {
          id: string
          user_id: string
          agent_id: string
          tool_name: string
          category: string
          description: string | null
          input: Json | null
          risk_score: number
          risk_reason: string | null
          decision: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          agent_id: string
          tool_name: string
          category: string
          description?: string | null
          input?: Json | null
          risk_score: number
          risk_reason?: string | null
          decision: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          agent_id?: string
          tool_name?: string
          category?: string
          description?: string | null
          input?: Json | null
          risk_score?: number
          risk_reason?: string | null
          decision?: string
          created_at?: string
        }
      }
      pending_approvals: {
        Row: {
          id: string
          user_id: string
          agent_id: string
          tool_name: string
          category: string
          description: string | null
          input: Json | null
          risk_score: number
          risk_reason: string | null
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          agent_id: string
          tool_name: string
          category: string
          description?: string | null
          input?: Json | null
          risk_score: number
          risk_reason?: string | null
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          agent_id?: string
          tool_name?: string
          category?: string
          description?: string | null
          input?: Json | null
          risk_score?: number
          risk_reason?: string | null
          status?: string
          created_at?: string
        }
      }
      reports: {
        Row: {
          id: string
          user_id: string
          prompt: string
          content: string
          type: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          prompt: string
          content: string
          type: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          prompt?: string
          content?: string
          type?: string
          created_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
