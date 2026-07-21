import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import api from "../services/api";
import Navbar from "../components/Navbar";
import SignaturePad from "../components/SignaturePad";
import { useAuth } from "../context/AuthContext";
import "./MeetingScanner.css";

const MeetingScanner = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  const [meeting, setMeeting] = useState(null);
  const [loadingMeeting, setLoadingMeeting] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const [scannerActive, setScannerActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState(null); // { type: 'success'|'already'|'error', name, message }
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [pendingSignature, setPendingSignature] = useState(null); // { token, name } aguardando assinatura

  const scannerRef = useRef(null);
  const cooldownRef = useRef(false);

  // Carrega o meeting e verifica acesso
  useEffect(() => {
    api
      .get(`/meetings/${id}`)
      .then(({ data }) => {
        const isOrganizer =
          user?.id && data.organizer?._id?.toString() === user.id;
        if (!isAdmin && !isOrganizer) {
          setAccessDenied(true);
          return;
        }
        setMeeting(data);
        setCheckedInCount(data.attendees.filter((a) => a.checkedIn).length);
        setTotalCount(data.attendees.length);
      })
      .catch(() => setAccessDenied(true))
      .finally(() => setLoadingMeeting(false));
  }, [id]);

  const extractToken = (text) => {
    // Suporta URL completa ou token direto
    const match = text.match(/\/checkin\/([a-zA-Z0-9\-_]+)/);
    return match ? match[1] : text.trim();
  };

  const startScanner = async () => {
    setScannerActive(true);
    setLastResult(null);
    await new Promise((r) => setTimeout(r, 100));

    const scanner = new Html5Qrcode("qr-scanner-region");
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        async (decodedText) => {
          if (cooldownRef.current || processing) return;
          cooldownRef.current = true;
          setProcessing(true);
          setLastResult(null);

          const token = extractToken(decodedText);
          try {
            // 1. Busca os dados do participante sem confirmar presença ainda
            const { data } = await api.get(`/meetings/lookup-token/${token}`);

            if (data.alreadyCheckedIn) {
              setLastResult({
                type: "already",
                name: data.name,
                message: "Presença já registrada",
              });
              setProcessing(false);
              setTimeout(() => { cooldownRef.current = false; }, 2500);
            } else {
              // 2. Exibe o pad de assinatura; cooldown permanece ativo até finalizar
              setPendingSignature({ token, name: data.name });
              setProcessing(false);
            }
          } catch (err) {
            setLastResult({
              type: "error",
              name: null,
              message: err.response?.data?.message || "QR Code inválido",
            });
            setProcessing(false);
            setTimeout(() => { cooldownRef.current = false; }, 2500);
          }
        },
        () => {}, // ignore decode errors
      );
    } catch {
      setLastResult({
        type: "error",
        name: null,
        message: "Não foi possível acessar a câmera",
      });
      setScannerActive(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {}
      scannerRef.current = null;
    }
    setScannerActive(false);
  };

  const handleSignatureConfirm = async (dataUrl) => {
    const { token, name } = pendingSignature;
    setPendingSignature(null);
    setProcessing(true);
    try {
      const { data } = await api.post(`/meetings/checkin/${token}`, {
        signature: dataUrl,
      });
      if (data.alreadyCheckedIn) {
        setLastResult({ type: "already", name: data.attendee?.name || name, message: "Presença já registrada" });
      } else {
        setLastResult({ type: "success", name: data.attendee?.name || name, message: "Presença confirmada!" });
        setCheckedInCount((prev) => prev + 1);
      }
    } catch (err) {
      setLastResult({
        type: "error",
        name,
        message: err.response?.data?.message || "Erro ao confirmar presença",
      });
    } finally {
      setProcessing(false);
      setTimeout(() => { cooldownRef.current = false; }, 2500);
    }
  };

  const handleSignatureCancel = () => {
    setPendingSignature(null);
    setProcessing(false);
    cooldownRef.current = false;
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  if (loadingMeeting)
    return (
      <div className="app-layout">
        <Navbar />
        <main className="main-content">
          <div className="loading">Carregando...</div>
        </main>
      </div>
    );

  if (accessDenied)
    return (
      <div className="app-layout">
        <Navbar />
        <main className="main-content">
          <div className="error-msg">
            Acesso negado. Somente o organizador ou admin pode escanear.
          </div>
          <Link to="/meetings" className="back-link" style={{ marginTop: 16 }}>
            ← Voltar
          </Link>
        </main>
      </div>
    );

  return (
    <div className="app-layout">
      <Navbar />
      {pendingSignature && (
        <SignaturePad
          name={pendingSignature.name}
          onConfirm={handleSignatureConfirm}
          onCancel={handleSignatureCancel}
        />
      )}
      <main className="main-content">
        <div className="page-header">
          <div>
            <Link to={`/meetings/${id}`} className="back-link">
              ← Voltar ao evento
            </Link>
            <h1>Scanner de Check-in</h1>
            <p className="scanner-subtitle">{meeting?.title}</p>
          </div>
        </div>

        <div className="scanner-layout">
          <div className="scanner-card">
            <div className="scanner-counter">
              <span className="counter-value">{checkedInCount}</span>
              <span className="counter-sep">/</span>
              <span className="counter-total">{totalCount}</span>
              <span className="counter-label">presentes</span>
            </div>

            <div className="scanner-viewport">
              <div
                id="qr-scanner-region"
                className={scannerActive ? "" : "scanner-hidden"}
              />
              {!scannerActive && (
                <div className="scanner-placeholder">
                  <span className="scanner-icon scanner-icon--cam" />
                  <p>Câmera desligada</p>
                </div>
              )}
            </div>

            {lastResult && (
              <div
                className={`scanner-result scanner-result--${lastResult.type}`}
              >
                <div className="result-text">
                  {lastResult.name && <strong>{lastResult.name}</strong>}
                  <span>{lastResult.message}</span>
                </div>
              </div>
            )}

            {processing && (
              <div className="scanner-processing">Identificando participante...</div>
            )}

            <div className="scanner-actions">
              {!scannerActive ? (
                <button
                  className="btn-primary btn-scanner-start"
                  onClick={startScanner}
                >
                  Iniciar scanner
                </button>
              ) : (
                <button
                  className="btn-secondary btn-scanner-stop"
                  onClick={stopScanner}
                >
                  Parar scanner
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default MeetingScanner;
