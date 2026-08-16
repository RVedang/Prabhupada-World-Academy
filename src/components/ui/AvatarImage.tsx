import React, { useState } from 'react';
import { User } from 'lucide-react';

interface AvatarImageProps {
  src?: string | null;
  alt: string;
  size?: number; // Size in pixels e.g. 40
  className?: string;
  fallbackInitials?: string;
}

export default function AvatarImage({
  src,
  alt,
  size = 40,
  className = '',
  fallbackInitials,
}: AvatarImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const getInitials = (name: string) => {
    if (fallbackInitials) return fallbackInitials;
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full overflow-hidden bg-muted/60 border border-border/40 shrink-0 select-none ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      {src && !error ? (
        <>
          {!loaded && (
            <div className="absolute inset-0 bg-muted animate-pulse rounded-full" />
          )}
          <img
            src={src}
            alt={alt}
            width={size}
            height={size}
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
            className={`w-full h-full object-cover transition-opacity duration-200 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </>
      ) : (
        <span className="font-semibold text-xs text-muted-foreground">
          {alt ? getInitials(alt) : <User className="w-4 h-4 text-muted-foreground" />}
        </span>
      )}
    </div>
  );
}
