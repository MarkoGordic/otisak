import React from 'react';
import { Fingerprint } from 'lucide-react';

interface FingerprintLogoProps {
  className?: string;
}

export function OtisakLogo({ className = 'w-12 h-12' }: FingerprintLogoProps) {
  return (
    <div className={`text-blue-500 ${className}`}>
      <Fingerprint className="w-full h-full" strokeWidth={1.5} />
    </div>
  );
}
