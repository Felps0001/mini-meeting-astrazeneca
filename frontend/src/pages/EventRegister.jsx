import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../services/api";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import logoAstra from "../assets/logo-astra.png";
import "./EventRegister.css";

const UF_LIST = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA",
  "MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN",
  "RO","RR","RS","SC","SE","SP","TO",
];

const EventRegister = () => {
  const { token } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", crm: "", crmUf: "" });

  // CRM validation: 'idle' | 'checking' | 'valid' | 'invalid' | 'error'
  const [crmStatus, setCrmStatus] = useState("idle");
  const [crmDoctorName, setCrmDoctorName] = useState("");
  const [crmError, setCrmError] = useState("");
  const debounceRef = useRef(null);

  useEffect(() => {
    api
      .get(`/meetings/invite/${token}`)
      .then((res) => setEvent(res.data))
      .catch((err) =>
        setError(err.response?.data?.message || "Evento não encontrado"),
      )
      .finally(() => setLoading(false));
  }, [token]);

  // Debounced CRM validation
  useEffect(() => {
    const crm = form.crm.replace(/\D/g, "");
    const uf = form.crmUf;

    if (!crm || !uf) {
      setCrmStatus("idle");
      setCrmDoctorName("");
      setCrmError("");
      return;
    }

    if (!/^\d{1,6}$/.test(crm)) {
      setCrmStatus("invalid");
      setCrmError("Número de CRM inválido (máx. 6 dígitos)");
      return;
    }

    clearTimeout(debounceRef.current);
    setCrmStatus("checking");
    setCrmDoctorName("");
    setCrmError("");

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/meetings/validate-crm?crm=${crm}&uf=${uf}`);
        if (res.data.valid) {
          setCrmStatus("valid");
          setCrmDoctorName(res.data.name || "");
        } else {
          setCrmStatus("invalid");
          setCrmError(res.data.message || "CRM não encontrado");
        }
      } catch (err) {
        setCrmStatus("error");
        setCrmError(err.response?.data?.message || "Erro ao verificar CRM");
      }
    }, 700);

    return () => clearTimeout(debounceRef.current);
  }, [form.crm, form.crmUf]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (crmStatus !== "valid") {
      setError("Verifique o CRM antes de confirmar a inscrição");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await api.post(`/meetings/invite/${token}/register`, {
        ...form,
        crm: form.crm.replace(/\D/g, ""),
        crmUf: form.crmUf,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.message || "Erro ao realizar inscrição");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading)
    return (
      <div className="event-page">
        <div className="event-card">
          <p>Carregando...</p>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="event-page">
        <div className="event-card">
          <div className="event-icon">❌</div>
          <h2>Evento indisponível</h2>
          <p className="error-msg">{error}</p>
        </div>
      </div>
    );

  if (success)
    return (
      <div className="event-page">
        <div className="event-card">
          <div className="event-icon">✅</div>
          <h2>Inscrição realizada!</h2>
          <p>
            Você foi inscrito com sucesso em <strong>{event.title}</strong>.
          </p>
          <p>Nos vemos lá! 🎉</p>
        </div>
      </div>
    );

  return (
    <div className="event-page">
      <div className="event-card">
        <div className="event-header">
          <img src={logoAstra} alt="AstraZeneca" className="event-brand-logo" />
          <h1>{event.title}</h1>
          {event.description && (
            <p className="event-description">{event.description}</p>
          )}
        </div>

        <div className="event-info">
          <div className="event-info-item">
            <span>📍</span>
            <span>{event.location}</span>
          </div>
          <div className="event-info-item">
            <span>📅</span>
            <span>
              {format(new Date(event.date), "dd 'de' MMMM 'de' yyyy", {
                locale: ptBR,
              })}
            </span>
          </div>
          <div className="event-info-item">
            <span>🕐</span>
            <span>
              {event.startTime}
              {event.endTime ? ` às ${event.endTime}` : ""}
            </span>
          </div>
          <div className="event-info-item">
            <span>👤</span>
            <span>Organizado por {event.organizer}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="event-form">
          <h3>Sua inscrição</h3>
          <div className="form-group">
            <label>Nome completo *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Seu nome completo"
              required
            />
          </div>
          <div className="form-group">
            <label>Email *</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((p) => ({ ...p, email: e.target.value }))
              }
              placeholder="seu@email.com"
              required
            />
          </div>

          <div className="form-group">
            <label>CRM *</label>
            <div className="crm-input-box">
              <span className="crm-prefix">CRM/</span>
              <input
                type="text"
                className="crm-number-input"
                value={form.crm}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    crm: e.target.value.replace(/\D/g, "").slice(0, 6),
                  }))
                }
                placeholder="000000"
                maxLength={6}
                required
              />
              <div className="crm-divider" />
              <select
                className="crm-uf-select"
                value={form.crmUf}
                onChange={(e) =>
                  setForm((p) => ({ ...p, crmUf: e.target.value }))
                }
                required
              >
                <option value="">UF</option>
                {UF_LIST.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </div>

            {crmStatus === "checking" && (
              <p className="crm-status crm-checking">⏳ Verificando CRM...</p>
            )}
            {crmStatus === "valid" && (
              <p className="crm-status crm-valid">
                ✔ CRM válido{crmDoctorName ? ` — ${crmDoctorName}` : ""}
              </p>
            )}
            {(crmStatus === "invalid" || crmStatus === "error") && (
              <p className="crm-status crm-invalid">✖ {crmError}</p>
            )}
          </div>

          {error && <div className="error-msg">{error}</div>}

          <button
            type="submit"
            className="btn-primary btn-full"
            disabled={submitting || crmStatus === "checking" || crmStatus === "idle"}
          >
            {submitting
              ? "Inscrevendo..."
              : crmStatus === "checking"
              ? "Verificando CRM..."
              : "✅ Confirmar inscrição"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default EventRegister;
