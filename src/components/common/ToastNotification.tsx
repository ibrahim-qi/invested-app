'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';

interface ToastNotificationProps {
  message: string | null;
  type: 'success' | 'error';
  duration?: number; // Duration in ms, defaults to 3000
  onClose: () => void; // Callback to clear the message in parent state
}

const ToastNotification: React.FC<ToastNotificationProps> = ({ 
    message, 
    type, 
    duration = 3000, 
    onClose 
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        // Allow time for fade-out animation before clearing message
        setTimeout(onClose, 500); // Adjust fade-out time if needed
      }, duration);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [message, duration, onClose]);

  if (!isVisible || !message) return null;

  const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500';
  const Icon = type === 'success' ? CheckCircleIcon : XCircleIcon;

  return (
    <div 
      className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg shadow-lg text-white ${bgColor} \
                  transition-opacity duration-300 ease-in-out ${isVisible ? 'opacity-100' : 'opacity-0'}`}
      role="alert"
    >
      <div className="flex items-center">
        <Icon className="h-5 w-5 mr-2" />
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  );
};

export default ToastNotification; 