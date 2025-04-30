'use client'

import { useState } from 'react';
import { createClient } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { TrashIcon } from '@heroicons/react/24/outline'; // Outline icon for delete

interface DeleteSimulationButtonProps {
  simulationId: string;
  userId: string; // Pass user ID for potential check (though RLS is primary)
}

const DeleteSimulationButton = ({ simulationId, userId }: DeleteSimulationButtonProps) => {
  const supabase = createClient();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    // Optional: Confirm deletion
    if (!confirm('Are you sure you want to delete this saved simulation?')) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    const { error: deleteError } = await supabase
      .from('saved_simulations')
      .delete()
      .eq('id', simulationId)
      .eq('user_id', userId); // Match user ID as an extra check (RLS enforces this too)

    if (deleteError) {
      console.error("Error deleting simulation:", deleteError.message);
      setError("Failed to delete. Please try again.");
      setIsDeleting(false);
    } else {
      // Refresh the dashboard data
      router.refresh();
      // No need to set loading false here as component might unmount on refresh
    }
  };

  return (
    <div>
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className="p-1 text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed dark:text-red-500 dark:hover:text-red-400"
        title="Delete Simulation"
      >
        {isDeleting ? (
          <span className="text-xs">Deleting...</span>
        ) : (
          <TrashIcon className="h-4 w-4" />
        )}
      </button>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
};

export default DeleteSimulationButton; 