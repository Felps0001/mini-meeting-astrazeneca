import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../context/ModalContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import "./MeetingDetail.css";

const MeetingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const { toast, confirm } = useModal();
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [attendeeFilter, setAttendeeFilter] = useState("");
  const csvInputRef = useRef(null);

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const delimiter = lines[0].includes(";") ? ";" : ",";
    const parseRow = (line) => {
      const result = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === delimiter && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    };
    const headerMap = {
      nome: "name",
      name: "name",
      email: "email",
      crm: "crm",
      uf: "crmUf",
      crmuf: "crmUf",
      estado: "crmUf",
      telefone: "phone",
      phone: "phone",
      celular: "phone",
      tel: "phone",
      cidade: "city",
      city: "city",
    };
    const rawHeaders = parseRow(lines[0]);
    const headers = rawHeaders.map(
      (h) => headerMap[h.toLowerCase().replace(/\s/g, "")] || h,
    );
    return lines
      .slice(1)
      .filter((l) => l.trim())
      .map((line) => {
        const values = parseRow(line);
        const obj = {};
        headers.forEach((h, i) => {
          if (h) obj[h] = values[i] || "";
        });
        return obj;
      });
  }

  const handleCSVImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length === 0) {
      toast("CSV vazio ou sem dados válidos", "error");
      return;
    }
    setImporting(true);
    try {
      const { data } = await api.post(`/meetings/${id}/attendees/bulk`, {
        attendees: rows,
      });
      const parts = [`${data.inserted} importado(s)`];
      if (data.skipped > 0)
        parts.push(`${data.skipped} duplicado(s) ignorado(s)`);
      if (data.verifying > 0)
        parts.push(`${data.verifying} em verificação de CRM`);
      if (data.errors.length > 0) parts.push(`${data.errors.length} erro(s)`);
      toast(parts.join(", "), data.inserted > 0 ? "success" : "warning");
      await loadMeeting();
    } catch (err) {
      toast(err.response?.data?.message || "Erro ao importar CSV", "error");
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const header = "nome,email,crm,uf,telefone,cidade";
    const example =
      "João Silva,joao@email.com,123456,SP,(11) 99999-9999,São Paulo";
    const blob = new Blob([header + "\n" + example], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-participantes.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadMeeting = () => {
    return api
      .get(`/meetings/${id}`)
      .then((res) => setMeeting(res.data))
      .catch(() => setError("Erro ao carregar meeting"));
  };

  useEffect(() => {
    loadMeeting().finally(() => setLoading(false));
  }, [id]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadMeeting().finally(() => setRefreshing(false));
  };

  const handleRemoveAttendee = async (attendeeId, attendeeName) => {
    if (!(await confirm(`Cancelar a inscrição de ${attendeeName}?`))) return;
    try {
      await api.delete(`/meetings/${id}/attendees/${attendeeId}`);
      setMeeting((prev) => ({
        ...prev,
        attendees: prev.attendees.filter((a) => a._id !== attendeeId),
      }));
    } catch (err) {
      toast(
        err.response?.data?.message || "Erro ao cancelar inscrição",
        "error",
      );
    }
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}${import.meta.env.BASE_URL}event/${meeting.inviteToken}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!(await confirm("Excluir este meeting?"))) return;
    try {
      await api.delete(`/meetings/${id}`);
      navigate("/meetings");
    } catch (err) {
      toast(err.response?.data?.message || "Erro ao excluir", "error");
    }
  };

  const handleStatusChange = async (status) => {
    try {
      const res = await api.put(`/meetings/${id}`, { status });
      setMeeting(res.data);
    } catch {
      toast("Erro ao atualizar status", "error");
    }
  };

  if (loading)
    return (
      <div className="app-layout">
        <Navbar />
        <main className="main-content">
          <div className="loading">Carregando...</div>
        </main>
      </div>
    );
  if (error)
    return (
      <div className="app-layout">
        <Navbar />
        <main className="main-content">
          <div className="error-msg">{error}</div>
        </main>
      </div>
    );

  const isOrganizer =
    !!user?.id && meeting.organizer?._id?.toString() === user.id;
  const canEdit = isAdmin || isOrganizer;

  const attendeeQuery = attendeeFilter.trim().toLowerCase();
  const filteredAttendees = attendeeQuery
    ? meeting.attendees.filter((a) => {
        const crmStr = a.crm ? `${a.crm}/${a.crmUf || ""}`.toLowerCase() : "";
        return (
          a.name?.toLowerCase().includes(attendeeQuery) ||
          a.email?.toLowerCase().includes(attendeeQuery) ||
          a.phone?.toLowerCase().includes(attendeeQuery) ||
          a.city?.toLowerCase().includes(attendeeQuery) ||
          crmStr.includes(attendeeQuery)
        );
      })
    : meeting.attendees;
  const checkedInCount = meeting.attendees.filter((a) => a.checkedIn).length;

  return (
    <div className="app-layout">
      <Navbar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <Link to="/meetings" className="back-link">
              ← Voltar
            </Link>
            <h1>{meeting.title}</h1>
          </div>
          <div className="header-actions">
            {meeting.status === "ativo" && (
              <button className="btn-invite" onClick={copyInviteLink}>
                {copied ? "Link copiado" : "Copiar link de inscrição"}
              </button>
            )}
            {meeting.status === "ativo" && (
              <button
                className="btn-invite btn-qr"
                onClick={() => {
                  const link = `${window.location.origin}${import.meta.env.BASE_URL}event/${meeting.inviteToken}/qrcode`;
                  window.open(link, "_blank", "noopener,noreferrer");
                }}
              >
                QR Codes de check-in
              </button>
            )}
            {canEdit && (
              <Link to={`/meetings/${id}/scan`} className="btn-invite btn-scan">
                Escanear check-in
              </Link>
            )}
            {canEdit && (
              <Link to={`/meetings/${id}/edit`} className="btn-secondary">
                Editar evento
              </Link>
            )}
            {isAdmin && (
              <button className="btn-danger" onClick={handleDelete}>
                Excluir evento
              </button>
            )}
          </div>
        </div>

        <div className="detail-grid">
          <div className="detail-card">
            <h3>Informações do Evento</h3>
            <div className="detail-row">
              <span className="detail-label">Status</span>
              <span className={`status-badge status-${meeting.status}`}>
                {meeting.status}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">📍 Local</span>
              <span>{meeting.location}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">📅 Data</span>
              <span>
                {format(new Date(meeting.date), "dd 'de' MMMM 'de' yyyy", {
                  locale: ptBR,
                })}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">🕐 Horário</span>
              <span>
                {meeting.startTime}
                {meeting.endTime ? ` às ${meeting.endTime}` : ""}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">👤 Organizador</span>
              <span>{meeting.organizer?.name}</span>
            </div>
            {meeting.description && (
              <div className="detail-row">
                <span className="detail-label">📝 Descrição</span>
                <span>{meeting.description}</span>
              </div>
            )}

            {meeting.status === "ativo" && canEdit && (
              <div
                className="detail-row"
                style={{ gap: "8px", flexWrap: "wrap" }}
              >
                <button
                  className="btn-warn"
                  onClick={() => handleStatusChange("encerrado")}
                >
                  Encerrar evento
                </button>
                <button
                  className="btn-danger"
                  onClick={async () => {
                    if (await confirm("Cancelar este meeting?"))
                      handleStatusChange("cancelado");
                  }}
                >
                  Cancelar evento
                </button>
              </div>
            )}

            {meeting.status === "ativo" && (
              <div className="invite-link-box">
                <p>Link de inscrição para participantes:</p>
                <code>{`${window.location.origin}${import.meta.env.BASE_URL}event/${meeting.inviteToken}`}</code>
                <button className="btn-small" onClick={copyInviteLink}>
                  Copiar link
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="detail-card attendees-section">
          <div className="attendees-header">
            <h3>Participantes ({meeting.attendees.length})</h3>
            {meeting.attendees.length > 0 && (
              <span className="checkin-counter">
                {checkedInCount}/{meeting.attendees.length} presentes
              </span>
            )}
            <button
              className="btn-small btn-refresh"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Atualizar lista"
            >
              {refreshing ? "Atualizando..." : "Atualizar"}
            </button>
            {canEdit && (
              <>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: "none" }}
                  onChange={handleCSVImport}
                />
                <button
                  className="btn-small btn-import"
                  onClick={() => csvInputRef.current?.click()}
                  disabled={importing}
                  title="Importar participantes via CSV"
                >
                  {importing ? "Importando..." : "Importar participantes"}
                </button>
                <button
                  className="btn-small btn-template"
                  onClick={downloadTemplate}
                  title="Baixar modelo CSV"
                >
                  Baixar modelo
                </button>
              </>
            )}
          </div>

          {meeting.attendees.length === 0 ? (
            <p className="empty-text">Nenhum participante inscrito ainda.</p>
          ) : (
            <>
              <div className="attendees-toolbar">
                <input
                  type="text"
                  className="attendees-search"
                  placeholder="Filtrar por nome, e-mail, CRM, telefone ou cidade..."
                  value={attendeeFilter}
                  onChange={(e) => setAttendeeFilter(e.target.value)}
                />
                {attendeeQuery && (
                  <span className="attendees-count">
                    {filteredAttendees.length} de {meeting.attendees.length}
                  </span>
                )}
              </div>

              <div className="attendees-table-wrap">
                <table className="attendees-table">
                  <thead>
                    <tr>
                      <th className="col-num">#</th>
                      <th>Nome</th>
                      <th>E-mail</th>
                      <th>CRM</th>
                      <th>Telefone</th>
                      <th>Cidade</th>
                      <th>Check-in</th>
                      <th>Inscrição</th>
                      {canEdit && <th className="col-action" />}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAttendees.length === 0 ? (
                      <tr>
                        <td
                          colSpan={canEdit ? 9 : 8}
                          className="attendees-empty-row"
                        >
                          Nenhum participante encontrado para o filtro.
                        </td>
                      </tr>
                    ) : (
                      filteredAttendees.map((att, idx) => (
                        <tr key={att._id || idx}>
                          <td className="col-num">{idx + 1}</td>
                          <td className="col-name">{att.name}</td>
                          <td className="col-email">{att.email}</td>
                          <td>
                            {att.crm ? (
                              <span className="cell-crm">
                                {att.crm}/{att.crmUf}
                                {att.crmVerified === true && (
                                  <span
                                    className="crm-verified-badge"
                                    title="CRM verificado no CFM."
                                  >
                                    ✓
                                  </span>
                                )}
                                {att.crmVerified === false && (
                                  <span
                                    className="crm-unverified-badge"
                                    title="O CRM não pôde ser confirmado no CFM. Revise manualmente."
                                  >
                                    não verificado
                                  </span>
                                )}
                                {att.crmVerified == null && (
                                  <span
                                    className="crm-pending-badge"
                                    title="Verificação de CRM em andamento. Atualize a lista em instantes."
                                  >
                                    verificando…
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="cell-empty">—</span>
                            )}
                          </td>
                          <td>{att.phone || <span className="cell-empty">—</span>}</td>
                          <td>{att.city || <span className="cell-empty">—</span>}</td>
                          <td>
                            <span
                              className={`checkin-badge ${
                                att.checkedIn
                                  ? "checkin-badge--in"
                                  : "checkin-badge--out"
                              }`}
                            >
                              {att.checkedIn ? "Presente" : "Aguardando"}
                            </span>
                          </td>
                          <td className="col-date">
                            {format(new Date(att.registeredAt), "dd/MM HH:mm")}
                          </td>
                          {canEdit && (
                            <td className="col-action">
                              <button
                                className="btn-remove-attendee"
                                title="Cancelar inscrição"
                                onClick={() =>
                                  handleRemoveAttendee(att._id, att.name)
                                }
                              >
                                ✕
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default MeetingDetail;
