import React from 'react';
import { useTheme } from '../lib/ThemeContext';

const ThemeToggle: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggleTheme}
      className={`
        relative inline-flex h-7 w-14 flex-shrink-0 cursor-pointer items-center rounded-full
        border-2 border-transparent transition-colors duration-200 ease-in-out
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        focus:ring-offset-white dark:focus:ring-offset-gray-900
        ${isDark ? 'bg-gray-600' : 'bg-gray-200'}
      `}
    >
      {/* Knob — emoji displayed inside */}
      <span
        aria-hidden="true"
        className={`
          pointer-events-none inline-flex h-5 w-5 transform items-center justify-center
          rounded-full shadow ring-0 transition duration-200 ease-in-out text-xs
          ${isDark ? 'translate-x-7 bg-gray-800' : 'translate-x-0 bg-yellow-100'}
        `}
      >
        {isDark ? '🌙' : '☀️'}
      </span>
    </button>
  );
};

export default ThemeToggle;
