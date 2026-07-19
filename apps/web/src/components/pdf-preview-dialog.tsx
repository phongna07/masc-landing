"use client";

import { Button } from "@masc-landing/ui/components/button";
import { XIcon } from "lucide-react";
import { useEffect, useRef } from "react";

export default function PdfPreviewDialog({ open, title, filename, previewUrl, loading, error, closeLabel, loadingLabel, onClose }: {
  open: boolean;
  title: string;
  filename: string;
  previewUrl?: string;
  loading: boolean;
  error?: string;
  closeLabel: string;
  loadingLabel: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog className="pdf-preview-dialog" ref={dialogRef} onClose={onClose} onCancel={onClose}>
      <div className="pdf-preview-dialog-header">
        <div><h2>{title}</h2><p>{filename}</p></div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={closeLabel}><XIcon aria-hidden="true" /></Button>
      </div>
      <div className="pdf-preview-dialog-body">
        {loading && <p className="pdf-preview-message" role="status">{loadingLabel}</p>}
        {error && <p className="pdf-preview-message form-error" role="alert">{error}</p>}
        {previewUrl && <iframe src={previewUrl} title={`${title}: ${filename}`} />}
      </div>
    </dialog>
  );
}
