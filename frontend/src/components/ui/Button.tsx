import React, { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className = '',
  variant = 'secondary',
  size = 'md',
  isLoading = false,
  disabled,
  leftIcon,
  rightIcon,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-colors duration-150 rounded select-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C8A96A]';

  const variantStyles: Record<ButtonVariant, string> = {
    primary:
      'bg-[#C8A96A] hover:bg-[#D8BC82] text-[#0B0C0E] font-semibold border border-[#C8A96A]',
    secondary:
      'bg-[#121317] hover:bg-[#181A1F] text-[#ECEDEF] border border-[#23262D] hover:border-[#2E333D]',
    outline:
      'bg-transparent hover:bg-[#181A1F] text-[#8B909A] hover:text-[#ECEDEF] border border-[#23262D]',
    ghost:
      'bg-transparent hover:bg-[#181A1F] text-[#8B909A] hover:text-[#ECEDEF]',
    danger:
      'bg-transparent hover:bg-[#C75B5B]/10 text-[#C75B5B] border border-[#C75B5B]/40',
  };

  const sizeStyles: Record<ButtonSize, string> = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5 min-h-[30px]',
    md: 'text-xs px-3.5 py-2 gap-2 min-h-[36px]',
    lg: 'text-sm px-4 py-2.5 gap-2 min-h-[40px]',
    icon: 'p-1.5 w-8 h-8 flex items-center justify-center',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-current" />
      ) : (
        leftIcon && <span className="flex-shrink-0">{leftIcon}</span>
      )}
      {children && <span>{children}</span>}
      {!isLoading && rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
    </button>
  );
};
