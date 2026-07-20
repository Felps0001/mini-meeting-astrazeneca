import React, { useEffect, useState } from "react";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { useModal } from "../context/ModalContext";
import "./Doctors.css";

const Doctors = () => {
  const { toast } = useModal();
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchDoctors = (term = "") => {
    setLoading(true);
    api
      .get("/doctors", { params: term ? { search: term } : {} })
      .then((res) => setDoctors(res.data))
      .catch(() => setError("Erro ao carregar médicos"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDoctors();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => fetchDoctors(search.trim()), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const openDetail = async (doc) => {
    setDetailLoading(true);
    setSelected(doc);
    try {
      const { data } = await api.get(`/doctors/${doc.crm}/${doc.crmUf}`);
      setSelected(data);
    } catch {
      toast("Erro ao carregar detalhes do médico", "error");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => setSelected(null);

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString("pt-BR") : "—";

  return (
    <div className="app-layout">
      <Navbar />
      <main className="main-content">
        <div className="page-header">
          <h1>Médicos cadastrados</h1>
        </div>

        <div className="doctors-toolbar">
          <input
            type="text"
            className="doctors-search"
            placeholder="Buscar por nome ou CRM..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {error && <div className="error-msg">{error}</div>}
        {loading ? (
          <div className="loading">Carregando...</div>
        ) : doctors.length === 0 ? (
          <div className="doctors-empty">Nenhum médico encontrado.</div>
        ) : (
          <div className="doctors-table-wrap">
            <table className="doctors-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CRM</th>
                  <th>Situação</th>
                  <th>Convidado</th>
                  <th>Compareceu</th>
                  <th>Validado em</th>
                </tr>
              </thead>
              <tbody>
                {doctors.map((d) => (
                  <tr key={d._id} onClick={() => openDetail(d)} className="doctor-row">
                    <td>
                      {d.name || "—"}
                      {d.crmVerified && <span className="badge-verified" title="CRM verificado no CFM"> ✓</span>}
                    </td>
                    <td>{d.crm}/{d.crmUf}</td>
                    <td>{d.situation || "—"}</td>
                    <td className="num">{d.stats?.invited ?? 0}</td>
                    <td className="num">{d.stats?.attended ?? 0}</td>
                    <td>{formatDate(d.lastValidatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {selected && (
        <div className="doctor-modal-overlay" onClick={closeDetail}>
          <div className="doctor-modal" onClick={(e) => e.stopPropagation()}>
            <button className="doctor-modal-close" onClick={closeDetail}>×</button>
            <h2>{selected.name || "Médico"}</h2>
            <p className="doctor-crm">
              CRM {selected.crm}/{selected.crmUf}
              {selected.crmVerified && <span className="badge-verified"> ✓ verificado</span>}
            </p>

            <div className="doctor-info-grid">
              <div><span>Situação</span><strong>{selected.situation || "—"}</strong></div>
              <div><span>Especialidade</span><strong>{selected.specialty || "—"}</strong></div>
              <div><span>Formação</span><strong>{selected.graduationInstitution || "—"}</strong></div>
              <div><span>Ano de formatura</span><strong>{selected.graduationYear || "—"}</strong></div>
              <div><span>Inscrição CFM</span><strong>{selected.registrationDate || "—"}</strong></div>
              <div><span>E-mail</span><strong>{selected.email || "—"}</strong></div>
              <div><span>Telefone</span><strong>{selected.phone || "—"}</strong></div>
              <div><span>Cidade</span><strong>{selected.city || "—"}</strong></div>
            </div>

            <div className="doctor-stats">
              <div className="stat-box">
                <span className="stat-num">{selected.stats?.invited ?? 0}</span>
                <span className="stat-label">Meetings inscritos</span>
              </div>
              <div className="stat-box">
                <span className="stat-num">{selected.stats?.attended ?? 0}</span>
                <span className="stat-label">Presenças</span>
              </div>
            </div>

            <h3>Histórico de meetings</h3>
            {detailLoading ? (
              <div className="loading">Carregando...</div>
            ) : selected.meetings && selected.meetings.length > 0 ? (
              <div className="doctor-history-wrap">
                <table className="doctor-history">
                  <thead>
                    <tr>
                      <th>Meeting</th>
                      <th>Inscrito em</th>
                      <th>Presença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.meetings.map((m, i) => (
                      <tr key={i}>
                        <td>{m.meeting?.title || m.meetingTitle || "—"}</td>
                        <td>{formatDate(m.registeredAt)}</td>
                        <td>
                          {m.attended
                            ? <span className="pill pill-ok">Compareceu</span>
                            : <span className="pill pill-no">Não compareceu</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="doctor-empty-history">Sem meetings registrados ainda.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Doctors;
