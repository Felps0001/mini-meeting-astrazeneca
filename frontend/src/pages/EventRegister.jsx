import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../services/api";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import logoAstra from "../assets/logo-astra.png";
import { QRCodeSVG } from "qrcode.react";
import "./EventRegister.css";

const UF_LIST = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
];

const EventRegister = () => {
  const { token } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [checkinToken, setCheckinToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    city: "",
    crm: "",
    crmUf: "",
  });

  const formatPhone = (digits) => {
    if (!digits) return "";
    if (digits.length <= 10) {
      return digits
        .replace(/(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    }
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{5})(\d)/, "$1-$2");
  };

  // CRM validation: 'idle' | 'checking' | 'valid' | 'invalid' | 'error'
  const [crmStatus, setCrmStatus] = useState("idle");
  const [crmDoctorName, setCrmDoctorName] = useState("");
  const [crmDoctor, setCrmDoctor] = useState(null);
  const [crmConfirmed, setCrmConfirmed] = useState(false);
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

    // Qualquer mudança no CRM/UF invalida a confirmação anterior.
    setCrmConfirmed(false);
    setCrmDoctor(null);

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
      // Validação no backend. Solução B: se o CFM confirmar => válido; se o CRM não
      // existir => inválido (bloqueia); se a fonte estiver fora => permite seguir,
      // mas marcado como "não verificado" (revisado pelo admin depois).
      try {
        const res = await api.get(`/meetings/validate-crm?crm=${crm}&uf=${uf}`);
        if (res.data.valid && res.data.verified) {
          setCrmStatus("valid");
          setCrmDoctorName(res.data.name || "");
          setCrmDoctor(res.data.doctor || { name: res.data.name || "" });
        } else if (res.data.valid) {
          setCrmStatus("unverified");
          setCrmError(
            res.data.message ||
              "CRM não pôde ser confirmado agora — sua inscrição será registrada e revisada.",
          );
        } else {
          setCrmStatus("invalid");
          setCrmError(res.data.message || "CRM não encontrado");
        }
      } catch (err) {
        // Erro de formato (400) bloqueia; demais falhas deixam o backend decidir.
        if (err.response?.status === 400) {
          setCrmStatus("invalid");
          setCrmError(
            err.response?.data?.message || "Número de CRM inválido",
          );
        } else {
          setCrmStatus("unverified");
          setCrmError(
            "CRM não pôde ser confirmado agora — sua inscrição será registrada e revisada.",
          );
        }
      }
    }, 700);

    return () => clearTimeout(debounceRef.current);
  }, [form.crm, form.crmUf]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (crmStatus !== "valid" && crmStatus !== "unverified") {
      setError("Verifique o CRM antes de confirmar a inscrição");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await api.post(`/meetings/invite/${token}/register`, {
        ...form,
        crm: form.crm.replace(/\D/g, ""),
        crmUf: form.crmUf,
      });
      setCheckinToken(res.data.checkinToken || "");
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.message || "Erro ao realizar inscrição");
    } finally {
      setSubmitting(false);
    }
  };

  // Confirma que o médico do card é o correto e libera os campos de contato,
  // já pré-preenchendo o nome oficial do CFM.
  const handleConfirmDoctor = () => {
    if (crmDoctor?.name) {
      setForm((p) => ({ ...p, name: crmDoctor.name }));
    }
    setCrmConfirmed(true);
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

  if (success) {
    const checkinUrl = checkinToken
      ? `${window.location.origin}/checkin/${checkinToken}`
      : null;
    return (
      <div className="event-page">
        <div className="event-card">
          <div className="event-icon">✅</div>
          <h2>Inscrição realizada!</h2>
          <p>
            Você foi inscrito com sucesso em <strong>{event.title}</strong>.
          </p>
          {checkinUrl && (
            <div className="checkin-qr-section">
              <p className="checkin-qr-title">Seu QR Code de check-in</p>
              <div className="checkin-qr-wrapper">
                <QRCodeSVG
                  value={checkinUrl}
                  size={200}
                  bgColor="#ffffff"
                  fgColor="#0d0518"
                  level="M"
                />
              </div>
              <p className="checkin-qr-hint">
                📱 Salve este QR Code — mostre ao organizador no dia do evento
                para confirmar sua presença.
              </p>
              <div className="checkin-token-box">
                <span className="checkin-token-label">Token de backup:</span>
                <code className="checkin-token-value">{checkinToken}</code>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

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

          {/* Passo 1: CRM */}
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
            {(crmStatus === "invalid" || crmStatus === "error") && (
              <p className="crm-status crm-invalid">✖ {crmError}</p>
            )}
          </div>

          {/* Passo 2: card com os dados do médico (CFM) para confirmação */}
          {crmStatus === "valid" && !crmConfirmed && (
            <div className="doctor-confirm-card">
              <div className="doctor-confirm-head">
                <span className="doctor-confirm-badge">✔ CRM verificado no CFM</span>
              </div>
              <h4>{crmDoctor?.name || crmDoctorName}</h4>
              <div className="doctor-confirm-grid">
                <div>
                  <span>CRM</span>
                  <strong>
                    {crmDoctor?.crm || form.crm.replace(/\D/g, "")}/
                    {crmDoctor?.crmUf || form.crmUf}
                  </strong>
                </div>
                {crmDoctor?.situation && (
                  <div><span>Situação</span><strong>{crmDoctor.situation}</strong></div>
                )}
                {crmDoctor?.specialty && (
                  <div><span>Especialidade</span><strong>{crmDoctor.specialty}</strong></div>
                )}
                {crmDoctor?.graduationInstitution && (
                  <div><span>Formação</span><strong>{crmDoctor.graduationInstitution}</strong></div>
                )}
                {crmDoctor?.graduationYear && (
                  <div><span>Ano de formatura</span><strong>{crmDoctor.graduationYear}</strong></div>
                )}
                {crmDoctor?.registrationDate && (
                  <div><span>Inscrição CFM</span><strong>{crmDoctor.registrationDate}</strong></div>
                )}
              </div>
              <p className="doctor-confirm-question">É você / é este médico?</p>
              <div className="doctor-confirm-actions">
                <button type="button" className="btn-primary btn-full" onClick={handleConfirmDoctor}>
                  ✅ Sim, sou eu — continuar
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-full"
                  onClick={() => setForm((p) => ({ ...p, crm: "", crmUf: "" }))}
                >
                  Não, corrigir CRM
                </button>
              </div>
            </div>
          )}

          {/* Passo 2b: CFM indisponível — permite preencher manualmente */}
          {crmStatus === "unverified" && !crmConfirmed && (
            <div className="doctor-confirm-card doctor-confirm-warning">
              <p className="crm-status crm-warning">⚠ {crmError}</p>
              <button
                type="button"
                className="btn-primary btn-full"
                onClick={() => setCrmConfirmed(true)}
              >
                Preencher meus dados manualmente
              </button>
            </div>
          )}

          {/* Passo 3: dados de contato (após confirmar o médico) */}
          {crmConfirmed && (
            <>
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

              <div className="form-row-2">
                <div className="form-group">
                  <label>Telefone (DDD) *</label>
                  <input
                    type="tel"
                    value={formatPhone(form.phone)}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        phone: e.target.value.replace(/\D/g, "").slice(0, 11),
                      }))
                    }
                    placeholder="(11) 99999-9999"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Cidade *</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, city: e.target.value }))
                    }
                    placeholder="Sua cidade"
                    required
                  />
                </div>
              </div>

              {error && <div className="error-msg">{error}</div>}

              <button
                type="submit"
                className="btn-primary btn-full"
                disabled={submitting}
              >
                {submitting ? "Inscrevendo..." : "✅ Confirmar inscrição"}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default EventRegister;
