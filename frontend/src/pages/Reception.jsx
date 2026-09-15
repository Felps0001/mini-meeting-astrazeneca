import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, Search, UserCheck } from "lucide-react";
import api from "../services/api";
import SignaturePad from "../components/SignaturePad";
import logoAstra from "../assets/logo-astra.png";
import "./Reception.css";

const Reception = () => {
  const { token } = useParams();
  const [meeting, setMeeting] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [checkingIn, setCheckingIn] = useState(null);
  const [signingFor, setSigningFor] = useState(null);
  const scannerRef = useRef(null);
  const debounceRef = useRef(null);
  const scanCooldownRef = useRef(false);

  useEffect(() => {
    api.get(`/meetings/reception/${token}`)
      .then(({ data }) => setMeeting(data))
      .catch((error) => setMessage(error.response?.data?.message || "Não foi possível abrir a recepção"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get(`/meetings/reception/${token}/attendees?q=${encodeURIComponent(term)}`);
        setResults(data.results);
        setMessage(data.results.length ? "" : "Nenhum participante encontrado");
      } catch (error) {
        setResults([]);
        setMessage(error.response?.data?.message || "Erro ao buscar participante");
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, token]);

  const extractCheckinToken = (value) => {
    const match = value.match(/\/checkin\/([a-zA-Z0-9\-_]+)/);
    return match ? match[1] : value.trim();
  };

  const showAttendeeForCheckin = (attendee) => {
    if (attendee.checkedIn) {
      setMessage(`${attendee.name} já realizou check-in`);
      return;
    }
    setSigningFor(attendee);
  };

  const handleCheckin = async (signature) => {
    const attendee = signingFor;
    setSigningFor(null);
    setCheckingIn(attendee._id);
    try {
      const { data } = await api.post(`/meetings/reception/${token}/checkin/${attendee._id}`, { signature });
      if (data.alreadyCheckedIn) {
        setMessage(`${data.attendee.name} já realizou check-in`);
      } else {
        setMessage(`Check-in de ${data.attendee.name} realizado com sucesso`);
        setMeeting((current) => ({ ...current, checkedInCount: current.checkedInCount + 1 }));
      }
      setResults((current) => current.map((item) => item._id === attendee._id ? { ...item, checkedIn: true } : item));
    } catch (error) {
      setMessage(error.response?.data?.message || "Erro ao registrar check-in");
    } finally {
      setCheckingIn(null);
      scanCooldownRef.current = false;
    }
  };

  const startScanner = async () => {
    setScannerActive(true);
    setMessage("");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const scanner = new Html5Qrcode("reception-scanner");
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decodedText) => {
          if (scanCooldownRef.current) return;
          scanCooldownRef.current = true;
          try {
            const checkinToken = extractCheckinToken(decodedText);
            const { data } = await api.get(`/meetings/reception/${token}/lookup-token/${checkinToken}`);
            showAttendeeForCheckin(data.attendee);
          } catch (error) {
            setMessage(error.response?.data?.message || "QR Code inválido para este evento");
            scanCooldownRef.current = false;
          }
        },
        () => {},
      );
    } catch {
      setMessage("Não foi possível acessar a câmera");
      setScannerActive(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      scannerRef.current = null;
    }
    setScannerActive(false);
  };

  useEffect(() => () => { scannerRef.current?.stop().catch(() => {}); }, []);

  if (loading) return <main className="reception-page"><p>Carregando recepção...</p></main>;
  if (!meeting) return <main className="reception-page"><p className="reception-error">{message}</p></main>;

  return (
    <main className="reception-page">
      {signingFor && (
        <SignaturePad
          name={signingFor.name}
          onConfirm={handleCheckin}
          onCancel={() => { setSigningFor(null); scanCooldownRef.current = false; }}
        />
      )}
      <section className="reception-shell">
        <header className="reception-header">
          <img src={logoAstra} alt="AstraZeneca" />
          <div>
            <span>Recepção</span>
            <h1>{meeting.title}</h1>
            <p>{meeting.code} · {meeting.location}</p>
          </div>
          <div className="reception-counter"><strong>{meeting.checkedInCount}</strong><span>de {meeting.attendeeCount} presentes</span></div>
        </header>

        <div className="reception-tools">
          <div className="reception-search">
            <Search size={20} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, e-mail ou CRM" autoFocus />
            {searching && <span>Buscando...</span>}
          </div>
          <button className="reception-scan-button" onClick={scannerActive ? stopScanner : startScanner}>
            <Camera size={18} aria-hidden="true" />
            {scannerActive ? "Parar câmera" : "Ler QR Code"}
          </button>
        </div>

        {scannerActive && <div id="reception-scanner" className="reception-scanner" />}
        {message && <p className="reception-message">{message}</p>}

        <div className="reception-results">
          {results.map((attendee) => (
            <article className={`reception-attendee${attendee.checkedIn ? " is-checked-in" : ""}`} key={attendee._id}>
              <div>
                <h2>{attendee.name}</h2>
                <p>{attendee.crm ? `CRM ${attendee.crm}/${attendee.crmUf}` : attendee.email}</p>
              </div>
              {attendee.checkedIn ? (
                <span className="reception-done">Check-in realizado</span>
              ) : (
                <button onClick={() => showAttendeeForCheckin(attendee)} disabled={checkingIn === attendee._id}>
                  <UserCheck size={18} aria-hidden="true" />
                  {checkingIn === attendee._id ? "Confirmando..." : "Confirmar presença"}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
};

export default Reception;