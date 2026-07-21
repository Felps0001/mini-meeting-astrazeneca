import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import api from "../services/api";
import logoAstra from "../assets/logo-astra.png";
import SignaturePad from "../components/SignaturePad";
import "./QRLookup.css";

const QRLookup = () => {
  const { token } = useParams();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [eventTitle, setEventTitle] = useState("");
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [checkingIn, setCheckingIn] = useState(null); // id do attendee em processo
  const [signingFor, setSigningFor] = useState(null); // attendee aguardando assinatura
  const debounceRef = useRef(null);

  const checkinBase = `${window.location.origin}${import.meta.env.BASE_URL}checkin/`;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setMessage(q.length > 0 ? "Digite ao menos 3 caracteres" : "");
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setMessage("");
      try {
        const { data } = await api.get(
          `/meetings/invite/${token}/lookup?q=${encodeURIComponent(q)}`,
        );
        setEventTitle(data.eventTitle);
        setResults(data.results);
        if (data.results.length === 0)
          setMessage("Nenhum participante encontrado");
      } catch (err) {
        setMessage(err.response?.data?.message || "Erro ao buscar");
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [query, token]);

  // Abre o pad de assinatura para o participante
  const handleRequestCheckIn = (r) => {
    if (r.checkedIn || checkingIn) return;
    setSigningFor(r);
  };

  const handleSignatureConfirm = async (dataUrl) => {
    const r = signingFor;
    setSigningFor(null);
    setCheckingIn(r.id);
    try {
      const { data } = await api.post(`/meetings/checkin/${r.checkinToken}`, {
        signature: dataUrl,
      });
      setResults((prev) =>
        prev.map((item) =>
          item.id === r.id
            ? {
                ...item,
                checkedIn: true,
                checkInMsg: data.alreadyCheckedIn
                  ? "Já registrado"
                  : "Check-in realizado!",
              }
            : item,
        ),
      );
    } catch (err) {
      setResults((prev) =>
        prev.map((item) =>
          item.id === r.id
            ? {
                ...item,
                checkInError:
                  err.response?.data?.message || "Erro ao fazer check-in",
              }
            : item,
        ),
      );
    } finally {
      setCheckingIn(null);
    }
  };

  const handleSignatureCancel = () => setSigningFor(null);

  return (
    <div className="qrlookup-page">
      {signingFor && (
        <SignaturePad
          name={signingFor.name}
          onConfirm={handleSignatureConfirm}
          onCancel={handleSignatureCancel}
        />
      )}
      <div className="qrlookup-card">
        <div className="qrlookup-header">
          <img src={logoAstra} alt="AstraZeneca" className="qrlookup-logo" />
          <h1>Meu QR Code</h1>
          {eventTitle && <p className="qrlookup-event">{eventTitle}</p>}
          <p className="qrlookup-subtitle">
            Digite seu nome, e-mail ou CRM para encontrar seu QR Code de
            check-in
          </p>
        </div>

        <div className="qrlookup-search">
          <input
            type="text"
            placeholder="Buscar por nome, e-mail ou CRM..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {searching && <span className="qrlookup-spinner">⏳</span>}
        </div>

        {message && <p className="qrlookup-msg">{message}</p>}

        <div className="qrlookup-results">
          {results.map((r) => (
            <div
              key={r.id}
              className={`qrlookup-result${r.checkedIn ? " qrlookup-result--checkedin" : ""}`}
            >
              <div className="qrlookup-info">
                <strong>{r.name}</strong>
                <span>{r.email}</span>
                {r.crm && (
                  <span className="qrlookup-crm">
                    CRM {r.crm}/{r.crmUf}
                  </span>
                )}
                {r.checkedIn && (
                  <span className="qrlookup-badge">
                    ✅ {r.checkInMsg || "Check-in realizado"}
                  </span>
                )}
                {r.checkInError && (
                  <span className="qrlookup-badge qrlookup-badge--error">
                    ❌ {r.checkInError}
                  </span>
                )}
                {!r.checkedIn && (
                  <button
                    className="qrlookup-checkin-btn"
                    onClick={() => handleRequestCheckIn(r)}
                    disabled={!!checkingIn || !!signingFor}
                  >
                    {checkingIn === r.id
                      ? "Aguarde..."
                      : "Registrar presença"}
                  </button>
                )}
              </div>
              <div className="qrlookup-qr">
                <QRCodeSVG
                  value={`${checkinBase}${r.checkinToken}`}
                  size={130}
                  bgColor="transparent"
                  fgColor="#ffffff"
                  level="M"
                />
                <p className="qrlookup-qr-hint">Apresente na entrada</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default QRLookup;
