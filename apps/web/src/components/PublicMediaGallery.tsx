"use client";

import { useState } from "react";
import type { DealSeMediaImage } from "../lib/dealse-api";

type Props = {
  images?: DealSeMediaImage[];
  primaryUrl?: string | null;
  alt: string;
  fallback: string;
  variant: "deal" | "store";
  badge?: string;
};

export function PublicMediaGallery({ images = [], primaryUrl, alt, fallback, variant, badge }: Props) {
  const ordered = [...images].sort((left, right) => left.sortOrder - right.sortOrder);
  const primaryIndex = ordered.findIndex((image) => image.url === primaryUrl || image.isPrimary);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedImage = ordered.find((image) => image.id === selectedId);
  const selected = selectedImage ? ordered.indexOf(selectedImage) : Math.max(0, primaryIndex);
  const current = ordered[selected];
  const currentUrl = current?.url || primaryUrl || fallback;
  const slides = ordered.length > 1 ? ordered : [];

  return <div className={`public-media-gallery public-media-gallery--${variant}`}>
    <div className="public-media-gallery-main">
      <img
        src={currentUrl}
        alt={current?.altText || alt}
        loading="eager"
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = fallback;
        }}
      />
      {badge && <span className="public-media-gallery-badge">{badge}</span>}
      {slides.length > 1 && <div className="public-media-gallery-count" aria-live="polite">{selected + 1} / {slides.length}</div>}
    </div>
    {slides.length > 1 && <div className="public-media-gallery-thumbnails" role="group" aria-label="More photos">
      {slides.map((image, index) => <button key={image.id} type="button" aria-label={`Show image ${index + 1}`} aria-pressed={selected === index} className={selected === index ? "is-selected" : ""} onClick={() => setSelectedId(image.id)}>
        <img src={image.url} alt="" loading="lazy" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = fallback; }} />
      </button>)}
    </div>}
  </div>;
}
