import React, { useEffect, useState } from "react";
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
      toast(err.response?.data?.message || "Erro ao cancelar inscrição", "error");
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
                {copied ? "✅ Copiado!" : "🔗 Copiar link de convite"}
              </button>
            )}
            {canEdit && (
              <Link to={`/meetings/${id}/edit`} className="btn-secondary">
                ✏️ Editar
              </Link>
            )}
            {isAdmin && (
              <button className="btn-danger" onClick={handleDelete}>
                🗑️ Excluir
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
                  🔒 Encerrar Meeting
                </button>
                <button
                  className="btn-danger"
                  onClick={async () => {
                    if (await confirm("Cancelar este meeting?"))
                      handleStatusChange("cancelado");
                  }}
                >
                  ❌ Cancelar Meeting
                </button>
              </div>
            )}

            {meeting.status === "ativo" && (
              <div className="invite-link-box">
                <p>Link de inscrição para participantes:</p>
                <code>{`${window.location.origin}${import.meta.env.BASE_URL}event/${meeting.inviteToken}`}</code>
                <button className="btn-small" onClick={copyInviteLink}>
                  Copiar
                </button>
              </div>
            )}
          </div>

          <div className="detail-card">
            <div className="attendees-header">
              <h3>Participantes ({meeting.attendees.length})</h3>
              {meeting.attendees.length > 0 && (
                <span className="checkin-counter">
                  ✅ {meeting.attendees.filter((a) => a.checkedIn).length}/
                  {meeting.attendees.length} presentes
                </span>
              )}
              <button
                className="btn-small btn-refresh"
                onClick={handleRefresh}
                disabled={refreshing}
                title="Atualizar lista"
              >
                {refreshing ? "⏳" : "🔄"} Atualizar
              </button>
            </div>
            {meeting.attendees.length === 0 ? (
              <p className="empty-text">Nenhum participante inscrito ainda.</p>
            ) : (
              <div className="attendees-list">
                {meeting.attendees.map((att, idx) => (
                  <div key={idx} className="attendee-item">
                    <div className="attendee-info">
                      <strong>{att.name}</strong>
                      <span>{att.email}</span>
                    </div>
                    {att.signature && (
                      <div className="attendee-signature">
                        <img
                          src={att.signature}
                          alt={`Assinatura de ${att.name}`}
                        />
                      </div>
                    )}
                    <div className="attendee-right">
                      <span
                        className={`checkin-badge ${
                          att.checkedIn
                            ? "checkin-badge--in"
                            : "checkin-badge--out"
                        }`}
                      >
                        {att.checkedIn ? "✅ Presente" : "⏳ Aguardando"}
                      </span>
                      <span className="attendee-date">
                        {format(new Date(att.registeredAt), "dd/MM HH:mm")}
                      </span>
                      {canEdit && (
                        <button
                          className="btn-remove-attendee"
                          title="Cancelar inscrição"
                          onClick={() =>
                            handleRemoveAttendee(att._id, att.name)
                          }
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default MeetingDetail;
