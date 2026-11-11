"use client";

import { useState } from "react";
import RetailerImagePicker from "../../../components/RetailerImagePicker.jsx";

const retailerId = "00000000-0000-4000-8000-000000000001";
const targetId = "00000000-0000-4000-8000-000000000002";

export default function MediaPickerHarness() {
  const [images, setImages] = useState([]);
  return <main style={{ width: "min(100% - 32px, 760px)", margin: "32px auto" }}>
    <h1>Retailer image picker browser check</h1>
    <p>Select a local image to test the shared picker and crop step. This development-only page does not seed or change marketplace data.</p>
    <RetailerImagePicker
      label="Offer gallery"
      purpose="DEAL"
      retailerId={retailerId}
      targetId={targetId}
      images={images}
      altText="Local picker test image"
      presets={[{ label: "Portrait offer · 4:5", ratio: 4 / 5 }, { label: "Wide offer banner · 16:9", ratio: 16 / 9 }]}
      onChange={setImages}
    />
  </main>;
}
