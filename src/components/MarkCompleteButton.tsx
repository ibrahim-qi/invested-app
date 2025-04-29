'use client'

import { useState } from 'react';
import { createClient } from '@/lib/supabaseClient'; // Use client-side client
import { useRouter } from 'next/navigation';

interface MarkCompleteButtonProps {
  userId: string;
  moduleId: string;
  lessonId: string;
  isInitiallyComplete: boolean;
}

const MarkCompleteButton = ({ 
  userId, 
  moduleId, 
  lessonId, 
  isInitiallyComplete 
}: MarkCompleteButtonProps) => {
  const supabase = createClient();
  const router = useRouter(); // To refresh data after update
  const [isCompleted, setIsCompleted] = useState(isInitiallyComplete);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMarkComplete = async () => {
    if (isCompleted) return;

    setIsLoading(true);
    setError(null);

    const { error: insertError } = await supabase
      .from('user_lesson_progress')
      .insert({
        user_id: userId,
        module_id: moduleId,
        lesson_id: lessonId,
        // completed_at defaults to now() in the DB
      });

    if (insertError) {
      console.error("Error marking lesson complete:", insertError.message);
      setError("Failed to mark complete. Please try again.");
      setIsLoading(false);
    } else {
      setIsCompleted(true);
      setIsLoading(false);
      // Refresh the page server-side data to show updated status immediately
      // This triggers a re-fetch in the parent server component
      router.refresh(); 
    }
  };

  if (isCompleted) {
    return (
      <div className="mt-6 text-right">
        <span className="text-green-600 font-semibold py-2 px-4">Lesson Completed!</span>
      </div>
    );
  }

  return (
    <div className="mt-6 text-right">
      <button 
        onClick={handleMarkComplete}
        disabled={isLoading || isCompleted}
        className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Saving...' : 'Mark as Complete'}
      </button>
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
    </div>
  );
};

export default MarkCompleteButton; 