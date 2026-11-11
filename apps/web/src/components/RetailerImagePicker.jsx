"use client";

import { useEffect, useRef, useState } from "react";
import ImageCropDialog from "./ImageCropDialog.jsx";

const maxFileBytes = 5 * 1024 * 1024;
const maxPixels = 40_000_000;
const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function makeUploadId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

async function validateImage(file) {
  if (!acceptedTypes.has(file.type)) throw new Error(`${file.name}: use a JPEG, PNG, or WebP image.`);
  if (!file.size || file.size > maxFileBytes) throw new Error(`${file.name}: choose an image up to 5 MB.`);
  if (typeof createImageBitmap === "function") {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error(`${file.name}: this file could not be opened as an image.`);
    }
    const pixels = bitmap.width * bitmap.height;
    bitmap.close();
    if (!pixels || pixels > maxPixels) throw new Error(`${file.name}: image dimensions exceed the supported 40 megapixels.`);
    return;
  }
  const source = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => image.width * image.height <= maxPixels ? resolve() : reject(new Error(`${file.name}: image dimensions exceed the supported 40 megapixels.`));
      image.onerror = () => reject(new Error(`${file.name}: this file could not be opened as an image.`));
      image.src = source;
    });
  } finally {
    URL.revokeObjectURL(source);
  }
}

function uploadFile(form, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/media/upload");
    request.timeout = 120_000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      let result = {};
      try { result = JSON.parse(request.responseText || "{}"); } catch { /* use the generic response message */ }
      if (request.status >= 200 && request.status < 300 && typeof result.url === "string") resolve(result);
      else reject(new Error(typeof result.message === "string" ? result.message : "The image could not be uploaded. Retry the upload."));
    };
    request.onerror = () => reject(new Error("The connection was interrupted. Retry the upload."));
    request.ontimeout = () => reject(new Error("The upload took too long. Retry when the connection is stable."));
    request.onabort = () => reject(new Error("The upload was cancelled."));
    request.send(form);
  });
}

async function requestGalleryUpdate(payload) {
  const response = await fetch("/api/media/associations", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(result)) throw new Error(typeof result.message === "string" ? result.message : "The image gallery could not be saved. Retry the change.");
  return result;
}

function sortImages(items) { return [...(items || [])].sort((a, b) => a.sortOrder - b.sortOrder); }

export default function RetailerImagePicker({
  label,
  purpose,
  retailerId,
  targetId,
  images = [],
  altText,
  disabled = false,
  presets = [{ label: "Square · 1:1", ratio: 1 }],
  onChange = () => {},
}) {
  const [gallery, setGallery] = useState(() => sortImages(images));
  const galleryRef = useRef(gallery);
  const [jobs, setJobs] = useState([]);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const addInputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const replaceIndexRef = useRef(null);
  const activeJob = jobs[0] || null;

  useEffect(() => {
    const sorted = sortImages(images);
    galleryRef.current = sorted;
    setGallery(sorted);
  }, [images]);

  const commitGallery = (items, primaryId) => requestGalleryUpdate({
    retailerId,
    targetId,
    purpose,
    mediaIds: items.map(({ id }) => id),
    primaryMediaId: primaryId,
  });

  const publishGallery = (items, statusText) => {
    const sorted = sortImages(items);
    galleryRef.current = sorted;
    setGallery(sorted);
    onChange(sorted);
    if (statusText) setMessage(statusText);
    return sorted;
  };

  const acceptFiles = async (fileList, replaceIndex = null) => {
    if (!targetId) {
      setError("Save this store, product, or offer before adding images.");
      return;
    }
    const selected = Array.from(fileList || []);
    if (!selected.length) return;
    const currentCount = galleryRef.current.length;
    const freeSlots = 20 - currentCount + (replaceIndex === null ? 0 : 1);
    if (selected.length > freeSlots) {
      setError(`This gallery can contain up to 20 images. ${Math.max(0, freeSlots)} image slots are available.`);
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      for (const file of selected) await validateImage(file);
      setJobs(selected.map((file, index) => ({ file, uploadId: makeUploadId(), replaceIndex: index === 0 ? replaceIndex : null })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Choose a supported image file.");
    } finally {
      setBusy(false);
    }
  };

  const openReplace = (index) => {
    replaceIndexRef.current = index;
    replaceInputRef.current?.click();
  };

  const handleReplaceSelection = (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) acceptFiles([file], replaceIndexRef.current);
  };

  const handleAddSelection = (event) => {
    // FileList is live: clearing the input also clears the list. Copy first so
    // the selected files survive the reset and the same file can be selected again.
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    acceptFiles(files);
  };

  const savePrimary = async (mediaId) => {
    const current = galleryRef.current;
    const saved = await commitGallery(current, mediaId);
    publishGallery(saved, "Primary image updated.");
  };

  const moveImage = async (index, offset) => {
    const current = galleryRef.current;
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= current.length) return;
    const reordered = [...current];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    const primary = reordered.find(({ isPrimary }) => isPrimary) || reordered[0];
    const saved = await commitGallery(reordered, primary.id);
    publishGallery(saved, "Image order saved.");
  };

  const removeImage = async (image) => {
    const current = galleryRef.current;
    const next = current.filter(({ id }) => id !== image.id);
    let retained = current;
    if (image.isPrimary && next.length) {
      const saved = await commitGallery(current, next[0].id);
      retained = publishGallery(saved);
    }
    const response = await fetch(`/api/media/${encodeURIComponent(image.id)}?retailerId=${encodeURIComponent(retailerId)}`, { method: "DELETE" });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      throw new Error(typeof problem.message === "string" ? problem.message : "The image could not be removed. Retry the action.");
    }
    publishGallery(retained.filter(({ id }) => id !== image.id), "Image removed.");
  };

  const handleCropConfirm = async (file) => {
    if (!activeJob) return;
    setBusy(true);
    setProgress(0);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file, file.name);
      form.set("retailerId", retailerId);
      form.set("targetId", targetId);
      form.set("purpose", purpose);
      form.set("altText", altText?.trim() || `${label} image`);
      form.set("uploadId", activeJob.uploadId);
      const originalGallery = galleryRef.current;
      const replaced = activeJob.replaceIndex === null ? null : originalGallery[activeJob.replaceIndex];
      if (replaced) form.set("replaceMediaId", replaced.id);
      const uploaded = await uploadFile(form, setProgress);
      const next = replaced
        ? originalGallery.map((image, index) => index === activeJob.replaceIndex ? uploaded : image)
        : [...originalGallery, uploaded];
      const oldPrimary = originalGallery.find(({ isPrimary }) => isPrimary);
      const primaryId = replaced?.isPrimary || !oldPrimary ? uploaded.id : oldPrimary.id;
      const saved = await commitGallery(next, primaryId);
      publishGallery(saved, replaced ? "Image replaced and saved." : "Image uploaded and saved.");
      setJobs((previous) => previous.slice(1));
      setProgress(0);
    } catch (caught) {
      const problem = caught instanceof Error ? caught.message : "The image could not be saved. Retry the upload.";
      setError(problem);
      if (caught instanceof Error) throw caught;
      throw new Error(problem, { cause: caught });
    } finally {
      setBusy(false);
    }
  };

  const cancelCrop = () => {
    setJobs([]);
    setError("");
    setProgress(0);
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    if (!busy && !jobs.length && !disabled) acceptFiles(event.dataTransfer.files);
  };

  const perform = async (operation) => {
    setError("");
    setMessage("");
    try { await operation(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The image change could not be saved."); }
  };

  const primaryImage = gallery.find(({ isPrimary }) => isPrimary);
  const locked = disabled || busy || !targetId;

  return <section className="retailer-image-picker" aria-label={label}>
    <div className="retailer-image-picker-heading"><div><strong>{label}</strong><small>{gallery.length} of 20 images · JPEG, PNG, WebP · up to 5 MB each</small></div>{primaryImage && <span className="retailer-image-primary-state">Primary image set</span>}</div>
    <div className={`retailer-image-dropzone ${dragging ? "is-dragging" : ""} ${locked || jobs.length ? "is-disabled" : ""}`} role="group" aria-label={`Add ${label.toLowerCase()}`} onDragEnter={(event) => { event.preventDefault(); if (!locked && !jobs.length) setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={onDrop} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); addInputRef.current?.click(); } }} tabIndex={locked || jobs.length ? -1 : 0}>
      <input ref={addInputRef} className="retailer-image-native-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleAddSelection} disabled={locked || Boolean(jobs.length)} aria-label={`Choose ${label.toLowerCase()} files`} />
      <input ref={replaceInputRef} className="retailer-image-native-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleReplaceSelection} disabled={locked || Boolean(jobs.length)} aria-label="Choose a replacement image" />
      <span className="retailer-image-drop-icon" aria-hidden="true">↑</span><div><strong>Drop images here</strong><small>or browse from your device</small></div><button type="button" className="retailer-image-secondary" onClick={() => addInputRef.current?.click()} disabled={locked || Boolean(jobs.length)}>Browse images</button>
    </div>
    {!targetId && <p className="retailer-image-hint">Save this record first. Then you can add, crop, and manage its images.</p>}
    {gallery.length > 0 ? <div className="retailer-image-grid" aria-label="Saved image gallery">{gallery.map((image, index) => <article className={`retailer-image-card ${image.isPrimary ? "is-primary" : ""}`} key={image.id}>
      <div className="retailer-image-thumb-wrap"><img src={image.url} alt={image.altText || altText || label} loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} /><span>{image.isPrimary ? "Primary" : `${index + 1}`}</span></div>
      <div className="retailer-image-card-actions"><button type="button" onClick={() => perform(() => savePrimary(image.id))} disabled={locked || image.isPrimary} aria-pressed={image.isPrimary}>Set primary</button><button type="button" onClick={() => perform(() => moveImage(index, -1))} disabled={locked || index === 0} aria-label="Move image earlier">↑</button><button type="button" onClick={() => perform(() => moveImage(index, 1))} disabled={locked || index === gallery.length - 1} aria-label="Move image later">↓</button><button type="button" onClick={() => openReplace(index)} disabled={locked || Boolean(jobs.length)}>Replace</button><button type="button" onClick={() => perform(() => removeImage(image))} disabled={locked}>Remove</button></div>
      <small className="retailer-image-dimensions">{image.width && image.height ? `${image.width} × ${image.height}` : image.altText || "Saved image"}</small>
    </article>)}</div> : <div className="retailer-image-empty"><strong>No images added yet</strong><span>Photos are saved to your retailer account and can be changed later.</span></div>}
    {busy && <div className="retailer-image-progress" role="status"><span>{progress ? `Uploading image · ${progress}%` : "Preparing image…"}</span><progress value={progress} max="100" /></div>}
    {message && <p className="retailer-image-success" role="status">{message}</p>}
    {error && !activeJob && <p className="retailer-image-error" role="alert">{error}</p>}
    <p className="retailer-image-hint">Crop presets: {presets.map(({ label: preset }) => preset).join(" · ")}. Images are cropped in your browser and optimized by the DealSe API.</p>
    {activeJob && <ImageCropDialog key={activeJob.uploadId} file={activeJob.file} presets={presets} onCancel={cancelCrop} onConfirm={handleCropConfirm} uploadProgress={progress} />}
  </section>;
}
