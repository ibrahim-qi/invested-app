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
    <header className="bg-gray-900 text-gray-100 p-5 border-b border-gray-700 shadow-sm">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/" className="text-2xl font-semibold hover:text-white transition-colors">
          InvestEd
        </Link>
        <nav className="flex items-center space-x-6">
          <Link href="/learn" className="text-gray-300 hover:text-white transition-colors text-base">Learn</Link>
          <Link href="/simulation" className="text-gray-300 hover:text-white transition-colors text-base">Simulate</Link>

          {user ? (
            <div className="flex items-center space-x-4">
              <Link href="/dashboard" className="text-gray-300 hover:text-white transition-colors text-base">Dashboard</Link>
              <span className="text-sm text-gray-400">{user.email}</span>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white py-1.5 px-4 rounded text-sm font-medium transition-colors shadow-sm"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link 
              href="/login" 
              className="bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 px-4 rounded text-sm font-medium transition-colors shadow-sm"
            >
              Login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header; 