"use client";

import Image from "next/image";
import { useState } from "react";

interface BlogHeroImageProps {
  image: string;
  imageAlt: string;
}

export function BlogHeroImage({ image, imageAlt }: BlogHeroImageProps) {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className="relative w-full h-[400px] md:h-[500px] lg:h-[600px] mb-12 -mx-6 sm:-mx-0">
      <Image
        src={image}
        alt={imageAlt}
        fill
        priority
        className={`object-cover rounded-lg transition-opacity duration-500 ${
          isLoading ? "opacity-0" : "opacity-100"
        }`}
        onLoad={() => setIsLoading(false)}
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
      />
      {/* WebP fallback handled by Next.js Image component automatically */}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a2e] to-[#b0b0ff] animate-pulse rounded-lg" />
      )}
    </div>
  );
}