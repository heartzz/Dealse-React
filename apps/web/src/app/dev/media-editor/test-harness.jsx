"use client";

import { useEffect, useState } from "react";
import ImageCropDialog from "../../../components/ImageCropDialog.jsx";

export default function MediaEditorHarness() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/assets/hero-shopkeeper.png")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load the local browser test image.");
        return response.blob();
      })
      .then((blob) => { if (active) setFile(new File([blob], "media-editor-test.png", { type: "image/png" })); })
      .catch((problem) => { if (active) setError(problem instanceof Error ? problem.message : "Test image unavailable."); });
    return () => { active = false; };
  }, []);

  if (error) return <main role="alert">{error}</main>;
  if (!file) return <main role="status">Loading local crop test image…</main>;
  return <main>
    {result && <p role="status">Cropped output: {result}</p>}
    <ImageCropDialog
      file={file}
      presets={[{ label: "Square · 1:1", ratio: 1 }, { label: "Portrait · 4:5", ratio: 4 / 5 }]}
      onCancel={() => setFile(null)}
      onConfirm={async (output) => setResult(`${output.name} · ${output.type} · ${output.size} bytes`)}
    />
  </main>;
}
