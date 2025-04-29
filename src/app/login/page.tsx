'use client'

import { createClient } from '@/lib/supabaseClient' // Our client-side client
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared' // Default theme
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session) {
          // Redirect logged-in users away from the login page
          router.replace('/') 
        } else if (event === 'SIGNED_OUT') {
          // Optional: handle sign out if needed on this page
          // router.push('/login') // Could ensure they stay here
        }
      }
    );

    // Cleanup listener on component unmount
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [supabase, router]);

  return (
    <div className="flex justify-center items-center pt-10">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded shadow-md">
        <h1 className="text-2xl font-bold text-center text-gray-900">Login / Sign Up</h1>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          providers={['github']} // Example: Add providers like github, google etc.
          theme="light"
          redirectTo="/"
        />
      </div>
    </div>
  );
} 