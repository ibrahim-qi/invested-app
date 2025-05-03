import React, { useState } from 'react';

interface InfoTooltipProps {
  children: React.ReactNode; // The text/element to hover over
  tip: string; // The tooltip text to display
  className?: string; // Optional additional styling for the container
}

/**
 * A simple hover tooltip component using CSS.
 */
const InfoTooltip: React.FC<InfoTooltipProps> = ({ children, tip, className = '' }) => {
  const [isHovering, setIsHovering] = useState(false);

  return (
    <span 
      className={`relative inline-block ${className}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {children}
      <span 
        className={`absolute bottom-full left-1/2 z-10 w-max max-w-xs mb-2 px-3 py-1.5 \
                   text-xs font-medium text-white bg-gray-900 rounded-lg shadow-sm \
                   transition-opacity duration-300 transform -translate-x-1/2 \
                   ${isHovering ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
        role="tooltip"
      >
        {tip}
        {/* Optional: Add a small arrow/tail */}
        <div className="absolute left-1/2 top-full -mt-px w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-900 transform -translate-x-1/2" />
      </span>
    </span>
  );
};

export default InfoTooltip; 