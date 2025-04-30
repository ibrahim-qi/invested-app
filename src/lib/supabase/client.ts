import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { Database } from '@/lib/database.types'

// Client-side client (for use in 'use client' components)
export const createClient = () => createClientComponentClient<Database>()

// Re-export Database type if needed elsewhere, though importing directly from database.types is often cleaner
export type { Database } 