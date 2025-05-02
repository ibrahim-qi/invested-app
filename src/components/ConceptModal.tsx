import React from 'react';
import type { Database } from '@/lib/database.types';

type Concept = Database['public']['Tables']['concepts']['Row'];

interface ConceptModalProps {
  isOpen: boolean;
  onClose: () => void;
  concept: Concept | null;
}

const ConceptModal: React.FC<ConceptModalProps> = ({ isOpen, onClose, concept }) => {
  if (!isOpen || !concept) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 m-4 relative">
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
          aria-label="Close modal"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Modal Content */}
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">{concept.title}</h2>
        <div className="prose prose-sm max-w-none text-gray-600">
            {/* We might need more sophisticated rendering if content includes markdown/HTML */}
           <p>{concept.content}</p> 
        </div>
        <div className="mt-6 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConceptModal; 