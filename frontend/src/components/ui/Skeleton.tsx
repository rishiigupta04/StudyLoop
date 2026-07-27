import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'card' | 'avatar' | 'chart' | 'button';
  count?: number;
}

export default function Skeleton({
  className = '',
  variant = 'text',
  count = 1,
}: SkeletonProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'avatar':
        return 'w-10 h-10 rounded-full';
      case 'button':
        return 'h-10 w-28 rounded-xl';
      case 'card':
        return 'h-48 w-full rounded-2xl';
      case 'chart':
        return 'h-32 w-full rounded-xl';
      case 'text':
      default:
        return 'h-4 w-full rounded-md';
    }
  };

  const items = Array.from({ length: count });

  return (
    <>
      {items.map((_, index) => (
        <div
          key={`skeleton-${variant}-${index}`}
          className={`skeleton-shimmer border border-border/40 ${getVariantStyles()} ${className}`}
        />
      ))}
    </>
  );
}
