import React, { useEffect, useRef, useState } from "react";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { useModal } from "../context/ModalContext";
import "./AdminUsers.css";

const AdminUsers = () => {
  const { toast, confirm } = useModal();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [error, setError] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState(null);
  const csvInputRef = useRef(null);

  const fetchUsers = () => {
    api
      .get("/users")
      .then((res) => setUsers(res.data))
      .catch(() => setError("Erro ao carregar usuários"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteResult(null);
    setInviteLoading(true);
    try {
      const { data } = await api.post("/users/invite");
      setInviteResult({
        type: "success",
        message: data.message,
        link: data.inviteLink,
      });
    } catch (err) {
      setInviteResult({
        type: "error",
        message: err.response?.data?.message || "Erro ao gerar link",
      });
    } finally {
      setInviteLoading(false);
    }
  };

  const handleToggleActive = async (user) => {
    try {
      await api.patch(`/users/${user._id}`, { isActive: !user.isActive });
      fetchUsers();
    } catch {
      toast("Erro ao atualizar usuário", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!(await confirm("Remover este usuário?"))) return;
    try {
      await api.delete(`/users/${id}`);
      fetchUsers();
    } catch (err) {
      toast(err.response?.data?.message || "Erro ao remover", "error");
    }
  };

  const copyLink = (link) => {
    navigator.clipboard.writeText(link);
    toast("Link copiado!", "success");
  };

  const downloadTemplate = () => {
    const csv = "nome,email\nJoão Silva,joao@email.com\nMaria Santos,maria@email.com";
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-usuarios.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCSV = (text) => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const nameIdx = headers.findIndex(h => h === 'nome' || h === 'name');
    const emailIdx = headers.findIndex(h => h === 'email');
    if (nameIdx === -1 || emailIdx === -1) return null;
    return lines.slice(1)
      .filter(l => l.trim())
      .map(line => {
        const cols = line.split(',').map(c => c.trim());
        return { name: cols[nameIdx] || '', email: cols[emailIdx] || '' };
      })
      .filter(u => u.name && u.email);
  };

  const handleBulkImport = async (e) => {
    const file = e.target.files[0];
    if (!csvInputRef.current) return;
    csvInputRef.current.value = '';
    if (!file) return;
    const text = await file.text();
    const users = parseCSV(text);
    if (users === null) return toast('CSV inválido. Use as colunas: nome, email', 'error');
    if (users.length === 0) return toast('Nenhum usuário encontrado no arquivo.', 'warning');
    setBulkResults(null);
    setBulkLoading(true);
    try {
      const { data } = await api.post('/users/bulk-import', { users });
      setBulkResults(data.results);
      fetchUsers();
    } catch (err) {
      toast(err.response?.data?.message || 'Erro na importação', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="app-layout">
      <Navbar />
      <main className="main-content">
        <div className="page-header">
          <h1>Gerenciar Usuários</h1>
        </div>

        {/* Convidar usuário */}
        <div className="invite-section">
          <h3>Gerar link de cadastro</h3>
          <form onSubmit={handleInvite} className="invite-form">
            <button
              type="submit"
              className="btn-primary"
              disabled={inviteLoading}
            >
              {inviteLoading ? "Gerando..." : "🔗 Gerar link"}
            </button>
          </form>
          {inviteResult && (
            <div className={`invite-result ${inviteResult.type}`}>
              <p>{inviteResult.message}</p>
              {inviteResult.link && (
                <div className="invite-link-display">
                  <code>{inviteResult.link}</code>
                  <button
                    className="btn-small"
                    onClick={() => copyLink(inviteResult.link)}
                  >
                    Copiar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Importar CSV */}
        <div className="invite-section">
          <h3>Importar usuários via CSV</h3>
          <p className="bulk-hint">Crie várias contas de uma vez. Cada usuário receberá uma senha temporária.</p>
          <div className="bulk-actions">
            <button className="btn-secondary" onClick={downloadTemplate}>
              📄 Baixar template CSV
            </button>
            <button
              className="btn-primary"
              disabled={bulkLoading}
              onClick={() => csvInputRef.current?.click()}
            >
              {bulkLoading ? 'Importando...' : '📥 Importar CSV'}
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={handleBulkImport}
            />
          </div>

          {bulkResults && (
            <div className="bulk-results">
              <div className="bulk-summary">
                <span className="bulk-ok">✅ {bulkResults.filter(r => r.status === 'created').length} criados</span>
                <span className="bulk-err">❌ {bulkResults.filter(r => r.status === 'error').length} erros</span>
              </div>
              <div className="bulk-table-wrap">
                <table className="bulk-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Email</th>
                      <th>Senha temporária</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkResults.map((r, i) => (
                      <tr key={i} className={r.status === 'created' ? 'bulk-row-ok' : 'bulk-row-err'}>
                        <td>{r.name}</td>
                        <td>{r.email}</td>
                        <td>{r.tempPassword ? <code>{r.tempPassword}</code> : '—'}</td>
                        <td>{r.status === 'created' ? '✅ Criado' : `❌ ${r.message}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Lista de usuários */}
        {error && <div className="error-msg">{error}</div>}
        {loading ? (
          <div className="loading">Carregando...</div>
        ) : (
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Criado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id} className={!u.isActive ? "row-inactive" : ""}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`role-badge role-${u.role}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${u.isActive ? "status-ativo" : "status-encerrado"}`}
                      >
                        {u.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>{new Date(u.createdAt).toLocaleDateString("pt-BR")}</td>
                    <td className="actions-cell">
                      <button
                        className="btn-icon"
                        title={u.isActive ? "Desativar" : "Ativar"}
                        onClick={() => handleToggleActive(u)}
                      >
                        {u.isActive ? "🚫" : "✅"}
                      </button>
                      <button
                        className="btn-icon btn-danger"
                        title="Remover"
                        onClick={() => handleDelete(u._id)}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminUsers;
