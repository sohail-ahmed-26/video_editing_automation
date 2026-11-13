import React from 'react';

export type BadgeVariant = 'violet' | 'emerald' | 'amber' | 'rose' | 'neutral' | 'blue' | 'accent' | 'success' | 'danger';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  dot = false,
  className = '',
}) => {
  const variantStyles: Record<BadgeVariant, { container: string; dot: string }> = {
    accent: {
      container: 'bg-[#C8A96A]/10 text-[#D8BC82] border-[#C8A96A]/25',
      dot: 'bg-[#C8A96A]',
    },
    violet: {
      container: 'bg-[#C8A96A]/10 text-[#D8BC82] border-[#C8A96A]/25',
      dot: 'bg-[#C8A96A]',
    },
    emerald: {
      container: 'bg-[#5FA37A]/10 text-[#5FA37A] border-[#5FA37A]/25',
      dot: 'bg-[#5FA37A]',
    },
    success: {
      container: 'bg-[#5FA37A]/10 text-[#5FA37A] border-[#5FA37A]/25',
      dot: 'bg-[#5FA37A]',
    },
    amber: {
      container: 'bg-[#C8A96A]/10 text-[#D8BC82] border-[#C8A96A]/25',
      dot: 'bg-[#C8A96A]',
    },
    rose: {
      container: 'bg-[#C75B5B]/10 text-[#C75B5B] border-[#C75B5B]/25',
      dot: 'bg-[#C75B5B]',
    },
    danger: {
      container: 'bg-[#C75B5B]/10 text-[#C75B5B] border-[#C75B5B]/25',
      dot: 'bg-[#C75B5B]',
    },
    blue: {
      container: 'bg-[#181A1F] text-[#ECEDEF] border-[#23262D]',
      dot: 'bg-[#8B909A]',
    },
    neutral: {
      container: 'bg-[#121317] text-[#8B909A] border-[#23262D]',
      dot: 'bg-[#8B909A]',
    },
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 gap-1.5',
    md: 'text-xs px-2.5 py-1 gap-1.5',
  };

  const style = variantStyles[variant] || variantStyles.neutral;

  return (
    <span
      className={`inline-flex items-center font-medium rounded border ${style.container} ${sizeStyles[size]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />}
      {children}
    </span>
  );
};
