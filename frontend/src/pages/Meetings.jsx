import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../context/ModalContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import "./Meetings.css";

const Meetings = () => {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const { isAdmin } = useAuth();
  const { toast, confirm } = useModal();
  const navigate = useNavigate();

  const fetchMeetings = () => {
    setLoading(true);
    api
      .get("/meetings")
      .then((res) => setMeetings(res.data))
      .catch(() => setError("Erro ao carregar meetings"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMeetings();
  }, []);

  const handleDelete = async (id) => {
    if (!(await confirm("Deseja excluir este meeting?"))) return;
    try {
      await api.delete(`/meetings/${id}`);
      fetchMeetings();
    } catch (err) {
      toast(err.response?.data?.message || "Erro ao excluir", "error");
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await api.put(`/meetings/${id}`, { status });
      fetchMeetings();
    } catch {
      toast("Erro ao atualizar status", "error");
    }
  };

  const copyInviteLink = (inviteToken) => {
    const link = `${window.location.origin}${import.meta.env.BASE_URL}event/${inviteToken}`;
    navigator.clipboard.writeText(link);
    toast("Link de convite copiado!", "success");
  };

  const statusCounts = {
    todos: meetings.length,
    ativo: meetings.filter((m) => m.status === "ativo").length,
    encerrado: meetings.filter((m) => m.status === "encerrado").length,
    cancelado: meetings.filter((m) => m.status === "cancelado").length,
  };

  const filtered =
    statusFilter === "todos"
      ? meetings
      : meetings.filter((m) => m.status === statusFilter);

  const filterTabs = [
    { key: "todos", label: "Todos" },
    { key: "ativo", label: "Ativos" },
    { key: "encerrado", label: "Encerrados" },
    { key: "cancelado", label: "Cancelados" },
  ];

  return (
    <div className="app-layout">
      <Navbar />
      <main className="main-content">
        <div className="page-header">
          <h1>Mini-Meetings</h1>
          <Link to="/meetings/new" className="btn-primary">
            + Novo Meeting
          </Link>
        </div>

        {error && <div className="error-msg">{error}</div>}

        {loading ? (
          <div className="loading">Carregando...</div>
        ) : meetings.length === 0 ? (
          <div className="empty-state">
            <p>Nenhum meeting cadastrado.</p>
            <Link to="/meetings/new" className="btn-primary">
              Criar meeting
            </Link>
          </div>
        ) : (
          <>
            <div className="filter-tabs">
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`filter-tab${statusFilter === tab.key ? " active" : ""}`}
                  onClick={() => setStatusFilter(tab.key)}
                >
                  {tab.label}
                  <span className="tab-count">{statusCounts[tab.key]}</span>
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="empty-state">
                <p>
                  Nenhum meeting{" "}
                  {statusFilter === "encerrado"
                    ? "encerrado"
                    : statusFilter === "cancelado"
                      ? "cancelado"
                      : "ativo"}{" "}
                  encontrado.
                </p>
              </div>
            ) : (
              <div className="meetings-table-wrap">
                <table className="meetings-table">
                  <thead>
                    <tr>
                      <th>Título</th>
                      <th>Local</th>
                      <th>Data</th>
                      <th>Horário</th>
                      {isAdmin && <th>Organizador</th>}
                      <th>Participantes</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((m) => (
                      <tr key={m._id}>
                        <td>
                          <Link
                            to={`/meetings/${m._id}`}
                            className="meeting-link"
                          >
                            {m.title}
                          </Link>
                        </td>
                        <td>📍 {m.location}</td>
                        <td>
                          {format(new Date(m.date), "dd/MM/yyyy", {
                            locale: ptBR,
                          })}
                        </td>
                        <td>
                          {m.startTime}
                          {m.endTime ? ` - ${m.endTime}` : ""}
                        </td>
                        {isAdmin && <td>{m.organizer?.name}</td>}
                        <td>
                          <span className="attendee-count">
                            👥 {m.attendees.length}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge status-${m.status}`}>
                            {m.status}
                          </span>
                        </td>
                        <td className="actions-cell">
                          <button
                            className="btn-icon"
                            title="Copiar link de convite"
                            onClick={() => copyInviteLink(m.inviteToken)}
                          >
                            🔗
                          </button>
                          <button
                            className="btn-icon"
                            title="Editar"
                            onClick={() => navigate(`/meetings/${m._id}/edit`)}
                          >
                            ✏️
                          </button>
                          {m.status === "ativo" && (
                            <button
                              className="btn-icon btn-warn"
                              title="Encerrar"
                              onClick={() =>
                                handleStatusChange(m._id, "encerrado")
                              }
                            >
                              🔒
                            </button>
                          )}
                          {m.status === "ativo" && (
                            <button
                              className="btn-icon btn-danger"
                              title="Cancelar"
                              onClick={async () => {
                                if (await confirm("Cancelar este meeting?"))
                                  handleStatusChange(m._id, "cancelado");
                              }}
                            >
                              ❌
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              className="btn-icon btn-danger"
                              title="Excluir"
                              onClick={() => handleDelete(m._id)}
                            >
                              🗑️
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Meetings;
