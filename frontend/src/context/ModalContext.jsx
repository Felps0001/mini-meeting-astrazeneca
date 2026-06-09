import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import "../components/Modal.css";

const ModalContext = createContext(null);

export const useModal = () => useContext(ModalContext);

/* ─── Toast ────────────────────────────────────────────────── */
const ICONS = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" };

function Toast({ id, message, type, onClose }) {
  return (
    <div className={`toast toast--${type}`}>
      <span className="toast-icon">{ICONS[type] || ICONS.info}</span>
      <span className="toast-message">{message}</span>
      <button className="toast-close" onClick={onClose}>✕</button>
    </div>
  );
}

/* ─── Confirm Modal ─────────────────────────────────────────── */
function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">⚠️</div>
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn-danger" onClick={onConfirm}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Provider ──────────────────────────────────────────────── */
export const ModalProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  const toast = useCallback((message, type = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      3500
    );
  }, []);

  const confirm = useCallback((message) => {
    return new Promise((resolve) => {
      setConfirmState({ message, resolve });
    });
  }, []);

  const handleResult = (result) => {
    if (confirmState) {
      confirmState.resolve(result);
      setConfirmState(null);
    }
  };

  const removeToast = (id) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ModalContext.Provider value={{ toast, confirm }}>
      {children}

      <div className="toast-container">
        {toasts.map((t) => (
          <Toast key={t.id} {...t} onClose={() => removeToast(t.id)} />
        ))}
      </div>

      {confirmState && (
        <ConfirmModal
          message={confirmState.message}
          onConfirm={() => handleResult(true)}
          onCancel={() => handleResult(false)}
        />
      )}
    </ModalContext.Provider>
  );
};
