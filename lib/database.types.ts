export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type Database = {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string
                    email: string | null
                    risk_limit: number | null
                    plan: string | null
                    created_at: string | null
                }
                Insert: {
                    id: string
                    email?: string | null
                    risk_limit?: number | null
                    plan?: string | null
                    created_at?: string | null
                }
                Update: {
                    id?: string
                    email?: string | null
                    risk_limit?: number | null
                    plan?: string | null
                    created_at?: string | null
                }
            }
            agents: {
                Row: {
                    id: string
                    user_id: string
                    name: string
                    goal: string
                    status: string | null
                    schedule: string | null
                    created_at: string | null
                }
                Insert: {
                    id?: string
                    user_id: string
                    name: string
                    goal: string
                    status?: string | null
                    schedule?: string | null
                    created_at?: string | null
                }
                Update: {
                    id?: string
                    user_id?: string
                    name?: string
                    goal?: string
                    status?: string | null
                    schedule?: string | null
                    created_at?: string | null
                }
            }
            actions: {
                Row: {
                    id: string
                    user_id: string
                    agent_id: string
                    category: string
                    tool: string
                    description: string
                    payload: Json | null
                    risk_score: number | null
                    risk_reason: string | null
                    verdict: string | null
                    created_at: string | null
                }
                Insert: {
                    id?: string
                    user_id: string
                    agent_id: string
                    category: string
                    tool: string
                    description: string
                    payload?: Json | null
                    risk_score?: number | null
                    risk_reason?: string | null
                    verdict?: string | null
                    created_at?: string | null
                }
                Update: {
                    id?: string
                    user_id?: string
                    agent_id?: string
                    category?: string
                    tool?: string
                    description?: string
                    payload?: Json | null
                    risk_score?: number | null
                    risk_reason?: string | null
                    verdict?: string | null
                    created_at?: string | null
                }
            }
            pending_approvals: {
                Row: {
                    id: string
                    user_id: string
                    agent_id: string
                    action_id: string | null
                    category: string
                    tool: string
                    description: string
                    payload: Json | null
                    risk_score: number | null
                    risk_reason: string | null
                    status: string | null
                    resolved_at: string | null
                    created_at: string | null
                }
                Insert: {
                    id?: string
                    user_id: string
                    agent_id: string
                    action_id?: string | null
                    category: string
                    tool: string
                    description: string
                    payload?: Json | null
                    risk_score?: number | null
                    risk_reason?: string | null
                    status?: string | null
                    resolved_at?: string | null
                    created_at?: string | null
                }
                Update: {
                    id?: string
                    user_id?: string
                    agent_id?: string
                    action_id?: string | null
                    category?: string
                    tool?: string
                    description?: string
                    payload?: Json | null
                    risk_score?: number | null
                    risk_reason?: string | null
                    status?: string | null
                    resolved_at?: string | null
                    created_at?: string | null
                }
            }
        }
        Views: Record<string, never>
        Functions: Record<string, never>
        Enums: Record<string, never>
    }
}
