"use client";

import { useEffect, useRef, useState } from "react";

const maxUploadBytes = 5 * 1024 * 1024;
const maxOutputEdge = 2000;

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The crop could not be exported. Try another image.")), type, quality);
  });
}

async function createCroppedFile(cropper, sourceFile) {
  const selection = cropper?.getCropperSelection();
  if (!selection || selection.width < 1 || selection.height < 1) throw new Error("Choose an image area before continuing.");
  const cropped = await selection.$toCanvas();
  const edge = Math.max(cropped.width, cropped.height);
  let output = cropped;
  if (edge > maxOutputEdge) {
    const scale = maxOutputEdge / edge;
    output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(cropped.width * scale));
    output.height = Math.max(1, Math.round(cropped.height * scale));
    output.getContext("2d")?.drawImage(cropped, 0, 0, output.width, output.height);
  }
  let blob = await canvasBlob(output, "image/webp", 0.9);
  if (blob.type !== "image/webp") blob = await canvasBlob(output, "image/jpeg", 0.9);
  if (blob.size > maxUploadBytes) blob = await canvasBlob(output, blob.type, 0.78);
  if (blob.size > maxUploadBytes) throw new Error("The cropped image is still larger than 5 MB. Zoom in closer or use a smaller source image.");
  const baseName = sourceFile.name.replace(/\.[^.]+$/, "") || "dealse-image";
  const extension = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `${baseName}-crop.${extension}`, { type: blob.type, lastModified: Date.now() });
}

export default function ImageCropDialog({ file, presets, onCancel, onConfirm, uploadProgress = 0 }) {
  const sourceImageRef = useRef(null);
  const dialogRef = useRef(null);
  const cancelRef = useRef(onCancel);
  const busyRef = useRef(false);
  const containerRef = useRef(null);
  const cropperRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const croppedFileRef = useRef(null);
  const previewTimerRef = useRef(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [presetIndex, setPresetIndex] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  cancelRef.current = onCancel;
  busyRef.current = busy;

  const selectedPreset = presets[Math.min(presetIndex, presets.length - 1)] || { label: "Square", ratio: 1 };

  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setSourceUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  useEffect(() => {
    if (!sourceUrl || !sourceImageRef.current || !containerRef.current) return undefined;
    let disposed = false;
    let instance;
    setLoading(true);
    setError("");
    import("cropperjs").then(async ({ default: Cropper }) => {
      if (disposed || !sourceImageRef.current || !containerRef.current) return;
      instance = new Cropper(sourceImageRef.current, { container: containerRef.current });
      cropperRef.current = instance;
      const image = instance.getCropperImage();
      if (!image) throw new Error("The crop editor could not load this image.");
      image.rotatable = true;
      image.scalable = true;
      image.translatable = true;
      image.initialFit = "contain";
      await image.$ready();
      if (disposed) return;
      const selection = instance.getCropperSelection();
      if (!selection) throw new Error("The crop selection could not be created.");
      selection.aspectRatio = selectedPreset.ratio;
      selection.initialAspectRatio = selectedPreset.ratio;
      selection.initialCoverage = 0.84;
      selection.movable = true;
      selection.resizable = true;
      selection.zoomable = false;
      selection.keyboard = true;
      selection.$render();
      const drawLivePreview = () => {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = setTimeout(async () => {
          try {
            const preview = await selection.$toCanvas({ width: 180, height: Math.round(180 / selectedPreset.ratio) });
            const target = previewCanvasRef.current;
            const context = target?.getContext("2d");
            if (!target || !context || disposed) return;
            context.clearRect(0, 0, target.width, target.height);
            context.drawImage(preview, 0, 0, target.width, target.height);
          } catch {
            // The final crop remains available even if the small live preview cannot be drawn.
          }
        }, 120);
      };
      selection.addEventListener("change", drawLivePreview);
      drawLivePreview();
      setLoading(false);
    }).catch((caught) => {
      if (!disposed) {
        setLoading(false);
        setError(caught instanceof Error ? caught.message : "This image could not be opened.");
      }
    });

    return () => {
      disposed = true;
      clearTimeout(previewTimerRef.current);
      if (instance) instance.destroy();
      cropperRef.current = null;
    };
  }, [sourceUrl, selectedPreset.ratio, resetKey]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector("button:not(:disabled)")?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busyRef.current) cancelRef.current();
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll("button:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])") || []);
      if (!focusable.length) { event.preventDefault(); dialogRef.current?.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, []);

  const runCropAction = (action) => {
    const image = cropperRef.current?.getCropperImage();
    if (!image) return;
    action(image);
  };

  const confirm = async (uncropped = false) => {
    setBusy(true);
    setError("");
    try {
      const output = uncropped ? file : (croppedFileRef.current || await createCroppedFile(cropperRef.current, file));
      if (!uncropped) croppedFileRef.current = output;
      await onConfirm(output);
      croppedFileRef.current = null;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The image could not be saved. Retry the upload.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="retailer-crop-backdrop" role="presentation">
    <section ref={dialogRef} className="retailer-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="retailer-crop-title" tabIndex={-1}>
      <header className="retailer-crop-header"><div><span className="retailer-crop-kicker">IMAGE EDITOR</span><h2 id="retailer-crop-title">Adjust your image</h2><p>Drag the frame or image, resize the crop, then check the live preview.</p></div><button type="button" aria-label="Cancel image crop" onClick={onCancel} disabled={busy}>×</button></header>
      <div className="retailer-crop-tools"><label>Crop shape<select value={presetIndex} onChange={(event) => { setPresetIndex(Number(event.target.value)); croppedFileRef.current = null; }} disabled={busy}>{presets.map((preset, index) => <option value={index} key={`${preset.label}-${preset.ratio}`}>{preset.label}</option>)}</select></label><span>{selectedPreset.ratio === 1 ? "1:1" : selectedPreset.ratio === 16 / 9 ? "16:9" : "4:5"}</span><div><button type="button" onClick={() => runCropAction((image) => image.$zoom(-0.1))} aria-label="Zoom out" disabled={loading || busy}>−</button><button type="button" onClick={() => runCropAction((image) => image.$zoom(0.1))} aria-label="Zoom in" disabled={loading || busy}>+</button><button type="button" onClick={() => runCropAction((image) => image.$rotate("-90deg"))} disabled={loading || busy}>Rotate</button><button type="button" onClick={() => { croppedFileRef.current = null; setResetKey((value) => value + 1); }} disabled={loading || busy}>Reset</button></div></div>
      <div className="retailer-crop-workspace"><div className="retailer-crop-canvas" ref={containerRef} aria-label="Crop selection area">{sourceUrl && <img ref={sourceImageRef} src={sourceUrl} alt="Image being cropped" />}</div><aside className="retailer-crop-preview"><span>LIVE PREVIEW</span><canvas ref={previewCanvasRef} width="180" height={Math.max(1, Math.round(180 / selectedPreset.ratio))} /><small>{selectedPreset.label}</small></aside></div>
      {loading && <p className="retailer-crop-state" role="status">Preparing image editor…</p>}
      {busy && <div className="retailer-crop-state" role="status"><span>{uploadProgress ? `Uploading image · ${uploadProgress}%` : "Preparing and saving image…"}</span><progress value={uploadProgress} max="100" /></div>}
      {error && <p className="retailer-image-error" role="alert">{error}</p>}
      <footer className="retailer-crop-actions"><button type="button" className="retailer-image-link" onClick={() => confirm(true)} disabled={busy}>Use original without cropping</button><span /><button type="button" className="retailer-image-secondary" onClick={onCancel} disabled={busy}>Cancel</button><button type="button" className="retailer-image-primary" onClick={() => confirm(false)} disabled={busy || loading}>{busy ? "Saving image…" : "Use this crop"}</button></footer>
    </section>
  </div>;
}
