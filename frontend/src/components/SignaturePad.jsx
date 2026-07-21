import React, { useCallback, useEffect, useRef, useState } from "react";
import "./SignaturePad.css";

/**
 * Pad de assinatura reutilizável.
 * Props:
 *   name       — nome do participante exibido no topo (opcional)
 *   onConfirm  — callback(dataUrl: string) chamado com a imagem PNG em base64
 *   onCancel   — callback chamado ao cancelar
 */
const SignaturePad = ({ name, onConfirm, onCancel }) => {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPos = useRef(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Inicializa o canvas com fundo branco
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = useCallback((e) => {
    e.preventDefault();
    isDrawing.current = true;
    lastPos.current = getPos(e, canvasRef.current);
  }, []);

  const draw = useCallback((e) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);

    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    lastPos.current = pos;
    setHasDrawn(true);
  }, []);

  const stopDraw = useCallback((e) => {
    if (e) e.preventDefault();
    isDrawing.current = false;
    lastPos.current = null;
  }, []);

  // Registra os eventos de toque como non-passive para poder chamar preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("touchstart", startDraw, { passive: false });
    canvas.addEventListener("touchmove", draw, { passive: false });
    canvas.addEventListener("touchend", stopDraw, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", startDraw);
      canvas.removeEventListener("touchmove", draw);
      canvas.removeEventListener("touchend", stopDraw);
    };
  }, [startDraw, draw, stopDraw]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const confirm = () => {
    onConfirm(canvasRef.current.toDataURL("image/png"));
  };

  return (
    <div className="sigpad-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="sigpad-card">
        <div className="sigpad-header">
          <h3>Assinatura do participante</h3>
          {name && <p className="sigpad-name">{name}</p>}
        </div>

        <div className="sigpad-area">
          <canvas
            ref={canvasRef}
            width={600}
            height={200}
            className="sigpad-canvas"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
          />
          {!hasDrawn && (
            <p className="sigpad-hint">Assine acima com o dedo ou o mouse</p>
          )}
        </div>

        <div className="sigpad-actions">
          <button
            type="button"
            className="btn-secondary sigpad-btn-clear"
            onClick={clearCanvas}
            disabled={!hasDrawn}
          >
            Limpar
          </button>
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={confirm}
            disabled={!hasDrawn}
          >
            Confirmar assinatura
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignaturePad;
