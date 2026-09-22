import React from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  children: React.ReactNode;
}

export default function Modal({ open, title, onClose, onConfirm, confirmLabel = '确认', cancelLabel = '取消', children }: ModalProps) {
  if (!open) return null;
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        {children}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>{cancelLabel}</button>
          {onConfirm && <button className="btn btn-primary" onClick={onConfirm}>{confirmLabel}</button>}
        </div>
      </div>
    </div>
  );
}
