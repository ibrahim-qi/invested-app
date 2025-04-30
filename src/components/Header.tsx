'use client'

import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';

const Header = () => {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!error) {
        setUser(data.user);
      }
    };

    fetchUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    // Optionally redirect: router.push('/');
  };

  return (
    <header className="bg-gray-800 text-white p-4">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/" className="text-xl font-bold">
          InvestEd
        </Link>
        <nav className="flex items-center space-x-6">
          <Link href="/learn" className="hover:text-gray-300 text-sm">Learn</Link>
          <Link href="/simulation" className="hover:text-gray-300 text-sm">Simulate</Link>

          {user ? (
            <div className="flex items-center space-x-4">
              <Link href="/dashboard" className="hover:text-gray-300 text-sm">Dashboard</Link>
              <span className="text-sm">{user.email}</span>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white py-1 px-3 rounded text-sm"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link href="/login" className="hover:text-gray-300 text-sm">Login</Link>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header; 