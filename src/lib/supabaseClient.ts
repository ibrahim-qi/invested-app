import { createClientComponentClient, createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import type { Database } from './database.types' // Correctly typed now

// Client-side client (for use in 'use client' components)
export const createClient = () =>
  createClientComponentClient<Database>()

// Server-side client (for use in Server Components, Route Handlers, Server Actions)
// Needs cookies() from next/headers
export const createSupabaseServerClient = () => {
  const cookieStore = cookies()
  return createServerComponentClient<Database>({ cookies: () => cookieStore }, {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  })
}

// Note: We will generate the Database types later using the Supabase CLI.
// For now, we use a placeholder type. 