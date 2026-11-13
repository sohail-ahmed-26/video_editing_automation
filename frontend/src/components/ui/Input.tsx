import React, { InputHTMLAttributes, forwardRef } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-[#8B909A]">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-[#8B909A]">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={`w-full bg-[#121317] border ${
              error ? 'border-[#C75B5B]' : 'border-[#23262D] focus:border-[#C8A96A]'
            } text-[#ECEDEF] placeholder-[#5a5f6b] text-sm rounded px-3 py-2 transition-colors duration-150 focus:outline-none focus:ring-1 ${
              error ? 'focus:ring-[#C75B5B]' : 'focus:ring-[#C8A96A]'
            } ${leftIcon ? 'pl-9' : ''} ${rightIcon ? 'pr-9' : ''} ${className}`}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 flex items-center pointer-events-none text-[#8B909A]">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-[#C75B5B] mt-1">{error}</p>}
        {!error && helperText && <p className="text-xs text-[#8B909A] mt-1">{helperText}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
