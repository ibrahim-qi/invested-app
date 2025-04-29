'use client' // Needs state for visibility

import { useState, type ReactNode } from 'react';

interface TooltipProps {
  children: ReactNode; // The element to hover over
  text: string;        // The tooltip text to display
}

const Tooltip = ({ children, text }: TooltipProps) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg shadow-sm dark:bg-gray-700 w-max max-w-xs z-10">
          {text}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-gray-900 dark:border-t-gray-700"></div>
        </div>
      )}
    </div>
  );
};

export default Tooltip; 