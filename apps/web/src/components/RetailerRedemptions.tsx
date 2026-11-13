"use client";

import { BrowserQRCodeReader } from "@zxing/browser";
import { CheckCircle, WarningCircle, XCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  RetailerRedemptionActionResult,
  RetailerRedemptionHistoryItem,
  RetailerRedemptionHistoryPage,
  RetailerRedemptionPreview,
} from "../app/marketplace-actions";
import { retailerRedemptionErrorMessage, retailerRedemptionMessages } from "../lib/retailer-redemption-feedback";

type Props = {
  retailerId: string;
  storeId: string;
  storeName: string;
  onValidate: (retailerId: string, storeId: string, credential: string) => Promise<RetailerRedemptionActionResult<RetailerRedemptionPreview>>;
  onConfirm: (retailerId: string, storeId: string, credential: string, idempotencyKey: string) => Promise<RetailerRedemptionActionResult<RetailerRedemptionHistoryItem>>;
  onLoadHistory: (retailerId: string, storeId: string, page?: number, limit?: number) => Promise<RetailerRedemptionHistoryPage>;
};

type ConfirmationOperation = { credential: string; idempotencyKey: string };
type ConfirmationReceipt = RetailerRedemptionHistoryItem;

function RedemptionFeedback({
  message,
  tone,
  action,
}: {
  message: string;
  tone: "success" | "error" | "info";
  action?: { label: string; onClick: () => void };
}) {
  const Icon = tone === "success" ? CheckCircle : tone === "error" ? XCircle : WarningCircle;
  return (
    <div className={`retailer-redemption-feedback is-${tone}`} role={tone === "success" || tone === "info" ? "status" : "alert"}>
      <Icon size={21} weight="fill" aria-hidden="true" />
      <p>{message}</p>
      {action && <button type="button" className="workspace-secondary-button" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}

const credentialPattern = /^[A-Za-z0-9_-]{43,128}$/;

function cameraErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return "Camera permission was denied. Allow camera access in your browser settings, or enter the credential manually below.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera is available. Connect a webcam or enter the credential manually below.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The camera could not start. Close other apps using it, or enter the credential manually below.";
  }
  if (typeof window !== "undefined" && !window.isSecureContext && window.location.hostname !== "localhost") {
    return "Camera scanning needs a secure HTTPS connection. Enter the credential manually below.";
  }
  return "The camera could not start in this browser. Enter the credential manually below.";
}

function discountLabel(offer: RetailerRedemptionPreview["offer"]) {
  if (offer.offerType === "PERCENTAGE" && offer.discountBps !== null) {
    return `${offer.discountBps / 100}% off`;
  }
  if (offer.offerType === "FIXED_AMOUNT" && offer.discountAmountMinor && offer.currency) {
    const amount = Number(offer.discountAmountMinor) / 100;
    return `${new Intl.NumberFormat("en-IN", { style: "currency", currency: offer.currency }).format(amount)} off`;
  }
  if (offer.offerType === "BUY_X_GET_Y") return "Bundle offer";
  if (offer.offerType === "OTHER") return "Special offer";
  return "See offer terms";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function newIdempotencyKey() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function RetailerRedemptions({ retailerId, storeId, storeName, onValidate, onConfirm, onLoadHistory }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const validationBusyRef = useRef(false);
  const confirmationBusyRef = useRef(false);
  const operationRef = useRef<ConfirmationOperation | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("");
  const [manualCredential, setManualCredential] = useState("");
  const [validationBusy, setValidationBusy] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [preview, setPreview] = useState<RetailerRedemptionPreview | null>(null);
  const [credentialForConfirmation, setCredentialForConfirmation] = useState("");
  const [confirmationOperation, setConfirmationOperation] = useState<ConfirmationOperation | null>(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [confirmationError, setConfirmationError] = useState("");
  const [confirmationRetryable, setConfirmationRetryable] = useState(false);
  const [receipt, setReceipt] = useState<ConfirmationReceipt | null>(null);
  const [history, setHistory] = useState<RetailerRedemptionHistoryPage | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  const releaseCamera = useCallback(() => {
    const video = videoRef.current;
    const stream = cameraStreamRef.current ?? (video?.srcObject instanceof MediaStream ? video.srcObject : null);
    try { controlsRef.current?.stop(); } catch { /* The tracks below are also stopped directly. */ }
    controlsRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (video) video.srcObject = null;
  }, []);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      setHistory(await onLoadHistory(retailerId, storeId, 1, 20));
    } catch {
      setHistoryError("Redemption history could not be loaded. Check your connection and try again.");
    } finally {
      setHistoryLoading(false);
    }
  }, [onLoadHistory, retailerId, storeId]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => () => {
    releaseCamera();
    validationBusyRef.current = false;
    confirmationBusyRef.current = false;
    operationRef.current = null;
  }, [releaseCamera]);

  const clearPendingReview = () => {
    setPreview(null);
    setCredentialForConfirmation("");
    setConfirmationOperation(null);
    operationRef.current = null;
    setConfirmationError("");
    setConfirmationRetryable(false);
    setReceipt(null);
  };

  const closeScanner = useCallback(() => {
    setScannerOpen(false);
    setManualCredential("");
  }, []);

  const validateCredential = useCallback(async (value: string) => {
    if (validationBusyRef.current) return;
    const credential = value.trim();
    setManualCredential("");
    setValidationError("");
    setConfirmationError("");
    setReceipt(null);
    setPreview(null);
    setCredentialForConfirmation("");
    setConfirmationOperation(null);
    operationRef.current = null;
    if (!credentialPattern.test(credential)) {
      setValidationError(retailerRedemptionMessages.invalid);
      return;
    }
    releaseCamera();
    validationBusyRef.current = true;
    setValidationBusy(true);
    try {
      const result = await onValidate(retailerId, storeId, credential);
      if (!result.success) {
        setValidationError(retailerRedemptionErrorMessage(result, "validation"));
        return;
      }
      setPreview(result.data);
      setCredentialForConfirmation(credential);
      setScannerOpen(false);
    } catch {
      setValidationError(retailerRedemptionErrorMessage({ status: 0, message: "" }, "validation"));
    } finally {
      validationBusyRef.current = false;
      setValidationBusy(false);
    }
  }, [onValidate, retailerId, storeId, releaseCamera]);

  useEffect(() => {
    if (!scannerOpen) return undefined;
    let disposed = false;
    setCameraStarting(true);
    setCameraMessage("");
    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraMessage("Camera scanning is not supported by this browser. Enter the credential manually below.");
        setCameraStarting(false);
        return;
      }
      if (!window.isSecureContext && window.location.hostname !== "localhost") {
        setCameraMessage("Camera scanning needs a secure HTTPS connection. Enter the credential manually below.");
        setCameraStarting(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          cameraStreamRef.current = null;
          return;
        }
        video.srcObject = stream;
        await video.play();
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromStream(stream, video, (result, error, callbackControls) => {
          if (error && error.name !== "NotFoundException" && !disposed) {
            setCameraMessage("The camera could not read that QR. Hold it steady or enter the credential manually below.");
          }
          if (!result || disposed || validationBusyRef.current) return;
          const captured = result.getText();
          try { callbackControls?.stop(); } catch { /* releaseCamera stops the media tracks. */ }
          releaseCamera();
          setScannerOpen(false);
          if (!credentialPattern.test(captured.trim())) {
            setValidationError(retailerRedemptionMessages.invalid);
            return;
          }
          void validateCredential(captured);
        });
        if (disposed) {
          controls.stop();
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        controlsRef.current = controls;
        setCameraStarting(false);
      } catch (error) {
        releaseCamera();
        if (!disposed) {
          setCameraMessage(cameraErrorMessage(error));
          setCameraStarting(false);
        }
      }
    };
    void startCamera();
    return () => {
      disposed = true;
      releaseCamera();
    };
  }, [scannerOpen, releaseCamera, validateCredential]);

  useEffect(() => {
    if (!scannerOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeScanner();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [scannerOpen, closeScanner]);

  const submitManualCredential = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void validateCredential(manualCredential);
  };

  const beginConfirmation = async () => {
    if (confirmationBusyRef.current || !credentialForConfirmation || !preview) return;
    let operation = operationRef.current;
    if (!operation) {
      operation = { credential: credentialForConfirmation, idempotencyKey: newIdempotencyKey() };
      operationRef.current = operation;
      setConfirmationOperation(operation);
    }
    confirmationBusyRef.current = true;
    setConfirmationBusy(true);
    setConfirmationError("");
    setConfirmationRetryable(false);
    try {
      const result = await onConfirm(retailerId, storeId, operation.credential, operation.idempotencyKey);
      if (!result.success) {
        setConfirmationError(retailerRedemptionErrorMessage(result, "confirmation"));
        setConfirmationRetryable(result.retryable);
        return;
      }
      setReceipt(result.data);
      setCredentialForConfirmation("");
      operationRef.current = null;
      setConfirmationOperation(null);
      await refreshHistory();
    } catch {
      setConfirmationError(retailerRedemptionErrorMessage({ status: 0, message: "" }, "confirmation"));
      setConfirmationRetryable(true);
    } finally {
      confirmationBusyRef.current = false;
      setConfirmationBusy(false);
    }
  };

  const openScanner = () => {
    clearPendingReview();
    setValidationError("");
    setCameraMessage("");
    setScannerOpen(true);
  };

  return (
    <div className="retailer-redemptions">
      <div className="retailer-redemptions-toolbar">
        <button type="button" className="retailer-button retailer-button-primary" onClick={openScanner}>Scan customer QR</button>
      </div>

      {validationError && !scannerOpen && <RedemptionFeedback message={validationError} tone="error" action={{ label: "Scan another QR", onClick: openScanner }} />}
      {validationBusy && <p className="retailer-redemption-loading" role="status">Checking this credential with DealSe…</p>}

      {preview && !receipt && (
        <section className="workspace-panel retailer-redemption-review" aria-labelledby="retailer-redemption-review-title">
          <div className="workspace-panel-heading">
            <div><h3 id="retailer-redemption-review-title">Review before redeeming</h3><p>Validation is read-only. Redemption happens only after you confirm.</p></div>
            <span className="workspace-ready-badge">VALID · NOT REDEEMED</span>
          </div>
          <RedemptionFeedback message={retailerRedemptionMessages.verified} tone="info" />
          <dl className="retailer-redemption-preview">
            <div><dt>Offer</dt><dd>{preview.offer.title}</dd></div>
            <div><dt>Discount</dt><dd>{discountLabel(preview.offer)}</dd></div>
            <div><dt>Store</dt><dd>{preview.store.name}</dd></div>
            <div><dt>Claim reference</dt><dd>…{preview.claimId.slice(-8)}</dd></div>
            <div><dt>Status</dt><dd>Available until {formatDate(preview.expiresAt)}</dd></div>
            {preview.offer.terms && <div className="retailer-redemption-terms"><dt>Terms</dt><dd>{preview.offer.terms}</dd></div>}
          </dl>
          {confirmationError && <RedemptionFeedback message={confirmationError} tone="error" />}
          <div className="retailer-redemption-actions">
            <button type="button" className="workspace-secondary-button" onClick={clearPendingReview} disabled={confirmationBusy}>Cancel</button>
            {confirmationRetryable
              ? <button type="button" className="retailer-button retailer-button-primary" onClick={() => void beginConfirmation()} disabled={confirmationBusy}>{confirmationBusy ? "Retrying…" : "Retry confirmation"}</button>
              : !confirmationError && <button type="button" className="retailer-button retailer-button-primary" onClick={() => void beginConfirmation()} disabled={confirmationBusy}>{confirmationBusy ? "Confirming…" : "Confirm redemption"}</button>}
            {confirmationError && !confirmationRetryable && <button type="button" className="retailer-button retailer-button-primary" onClick={() => { clearPendingReview(); openScanner(); }}>Scan another QR</button>}
          </div>
          {confirmationOperation && confirmationRetryable && <small className="retailer-redemption-note">A retry uses the same confirmation operation key.</small>}
        </section>
      )}

      {receipt && (
        <section className="workspace-panel retailer-redemption-success" role="status">
          <span className="workspace-stat-icon"><CheckCircle size={22} weight="fill" aria-hidden="true" /></span>
          <div><h3>{retailerRedemptionMessages.success}</h3><p>{receipt.dealTitle} · {storeName}</p><small>Reference …{receipt.id.slice(-8)} · {formatDate(receipt.redeemedAt)}</small></div>
          <button type="button" className="workspace-secondary-button" onClick={clearPendingReview}>Done</button>
        </section>
      )}

      {scannerOpen && (
        <div className="retailer-scanner-backdrop" role="presentation">
          <section className="retailer-scanner-dialog workspace-panel" role="dialog" aria-modal="true" aria-labelledby="retailer-scanner-title">
            <header><div><p className="retailer-eyebrow">CUSTOMER QR</p><h3 id="retailer-scanner-title">Scan at {storeName}</h3></div><button type="button" className="retailer-scanner-close" aria-label="Close scanner" onClick={closeScanner}>×</button></header>
            <p className="retailer-scanner-help">Point the camera at the customer’s QR. The camera stops as soon as a code is captured.</p>
            <div className="retailer-scanner-video-frame">
              <video ref={videoRef} autoPlay muted playsInline aria-label="Camera preview for QR scanning" />
              {cameraStarting && <span role="status">Starting camera…</span>}
            </div>
            {cameraMessage && <p className="retailer-redemption-error" role="alert">{cameraMessage}</p>}
            {validationError && <RedemptionFeedback message={validationError} tone="error" />}
            <form className="retailer-manual-credential" onSubmit={submitManualCredential}>
              <label htmlFor="retailer-redemption-credential">Enter credential manually</label>
              <div><input id="retailer-redemption-credential" value={manualCredential} onChange={(event) => setManualCredential(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={128} aria-describedby="retailer-redemption-credential-help" disabled={validationBusy} /><button type="submit" className="retailer-button retailer-button-primary" disabled={validationBusy || !manualCredential.trim()}>{validationBusy ? "Checking…" : "Validate"}</button></div>
              <small id="retailer-redemption-credential-help">Enter only the opaque DealSe credential. Do not enter customer details.</small>
            </form>
            <button type="button" className="workspace-secondary-button retailer-scanner-done" onClick={closeScanner}>Close scanner</button>
          </section>
        </div>
      )}

      <section className="workspace-panel retailer-redemption-history" aria-labelledby="retailer-redemption-history-title">
        <div className="workspace-panel-heading">
          <div><h3 id="retailer-redemption-history-title">Redemption history</h3><p>Confirmed redemptions for {storeName}; customer personal details are not shown.</p></div>
          <button type="button" className="workspace-secondary-button" onClick={() => void refreshHistory()} disabled={historyLoading}>{historyLoading ? "Refreshing…" : "Refresh history"}</button>
        </div>
        {historyLoading && <p className="retailer-redemption-loading" role="status">Loading redemption history…</p>}
        {historyError && <div className="retailer-redemption-error" role="alert"><p>{historyError}</p><button type="button" className="workspace-secondary-button" onClick={() => void refreshHistory()}>Try again</button></div>}
        {!historyLoading && !historyError && history?.items.length === 0 && <div className="workspace-empty retailer-redemption-empty"><span>✓</span><h4>No redemptions yet</h4><p>Confirmed customer redemptions for this store will appear here.</p></div>}
        {!historyLoading && !historyError && Boolean(history?.items.length) && <div className="retailer-redemption-history-list">{history?.items.map((item) => (
          <article className="retailer-redemption-history-row" key={item.id}>
            <div><strong>{item.dealTitle}</strong><small>{storeName} · Reference …{item.id.slice(-8)}</small></div>
            <time dateTime={item.redeemedAt}>{formatDate(item.redeemedAt)}</time>
            <span className="workspace-activity-status redeemed">Redeemed</span>
          </article>
        ))}</div>}
        {history && history.totalPages > 1 && <small className="retailer-redemption-note">Showing the latest {history.items.length} of {history.total} redemptions.</small>}
      </section>
    </div>
  );
}
