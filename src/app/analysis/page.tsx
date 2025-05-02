'use client'

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import type { Database } from '@/lib/database.types';
import type { User } from '@supabase/supabase-js';

// Type for saved simulation data from the table
type SavedSimulation = Database['public']['Tables']['saved_simulations']['Row'];

// Helper to format currency
const formatCurrency = (value: number | null) => {
  if (value === null) return 'N/A';
  return `£${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Helper to format date
const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

export default function AnalysisPage() {
  const supabase = createClient();
  const [simulations, setSimulations] = useState<SavedSimulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // Fetch user
  useEffect(() => {
    const getUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error('Error fetching user:', error);
        // Optionally handle error (e.g., redirect to login)
      } else {
        setUser(data.user);
      }
    };
    getUser();
    
    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
        authListener?.subscription.unsubscribe();
    };
  }, [supabase]);

  // Fetch saved simulations when user is available
  useEffect(() => {
    const fetchSimulations = async () => {
      if (!user) {
        setLoading(false); // Not logged in, stop loading
        return; 
      }

      setLoading(true);
      setError(null);

      try {
        const { data, error: dbError } = await supabase
          .from('saved_simulations')
          .select('*') // Select all columns for now
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }); // Show newest first

        if (dbError) {
          throw dbError;
        }

        setSimulations(data || []);
      } catch (err: any) {
        console.error('Error fetching saved simulations:', err.message);
        setError('Failed to load saved simulations. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchSimulations();
  }, [user, supabase]); // Re-run if user changes

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Saved Simulations</h1>
        <Link href="/dashboard" className="text-sm text-indigo-600 hover:underline">
          &larr; Back to Dashboard
        </Link>
      </div>

      {loading && (
        <div className="text-center py-10">
          <p className="text-gray-500">Loading simulations...</p>
          {/* Optional: Add a spinner */}
        </div>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      {!loading && !error && simulations.length === 0 && (
        <div className="text-center py-10 border-t border-gray-200 mt-6">
          <p className="text-gray-500 italic">You haven't saved any simulations yet.</p>
          <Link href="/simulation" className="mt-4 inline-block px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700">
            Run a new simulation
          </Link>
        </div>
      )}

      {!loading && !error && simulations.length > 0 && (
        <div className="overflow-x-auto bg-white rounded-lg shadow border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Saved</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Horizon (Yrs)</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Risk Level</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Final Balance (P50)</th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">View</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {simulations.map((sim) => (
                <tr key={sim.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {sim.simulation_name || `Simulation ${sim.id.substring(0, 6)}...`}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(sim.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {sim.time_horizon_years}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                    {sim.risk_level}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 text-right font-semibold">
                    {formatCurrency(sim.final_balance)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link href={`/analysis/${sim.id}`} className="text-indigo-600 hover:text-indigo-900">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
} 