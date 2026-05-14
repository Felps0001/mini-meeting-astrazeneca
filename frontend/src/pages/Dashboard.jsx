import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Navbar from '../components/Navbar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import './Dashboard.css';

const Dashboard = () => {
  const { user, isAdmin } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/meetings')
      .then(res => setMeetings(res.data))
      .catch(() => setError('Erro ao carregar meetings'))
      .finally(() => setLoading(false));
  }, []);

  const totalMeetings = meetings.length;
  const activeMeetings = meetings.filter(m => m.status === 'ativo').length;
  const totalAttendees = meetings.reduce((acc, m) => acc + m.attendees.length, 0);

  return (
    <div className="app-layout">
      <Navbar />
      <main className="main-content">
        <div className="page-header">
          <h1>Olá, {user?.name} 👋</h1>
          <p className="page-subtitle">
            {isAdmin ? 'Visão geral de todos os mini-meetings' : 'Seus mini-meetings'}
          </p>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">📋</div>
            <div className="stat-info">
              <span className="stat-value">{totalMeetings}</span>
              <span className="stat-label">Total de Meetings</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🟢</div>
            <div className="stat-info">
              <span className="stat-value">{activeMeetings}</span>
              <span className="stat-label">Meetings Ativos</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">👥</div>
            <div className="stat-info">
              <span className="stat-value">{totalAttendees}</span>
              <span className="stat-label">Participantes Total</span>
            </div>
          </div>
        </div>

        <div className="section-header">
          <h2>Meetings Recentes</h2>
          <Link to="/meetings/new" className="btn-primary">+ Novo Meeting</Link>
        </div>

        {error && <div className="error-msg">{error}</div>}

        {loading ? (
          <div className="loading">Carregando...</div>
        ) : meetings.length === 0 ? (
          <div className="empty-state">
            <p>Nenhum meeting ainda.</p>
            <Link to="/meetings/new" className="btn-primary">Criar primeiro meeting</Link>
          </div>
        ) : (
          <div className="meetings-grid">
            {meetings.slice(0, 6).map(meeting => (
              <Link to={`/meetings/${meeting._id}`} key={meeting._id} className="meeting-card">
                <div className="meeting-card-header">
                  <span className={`status-badge status-${meeting.status}`}>{meeting.status}</span>
                  <span className="meeting-date">
                    {format(new Date(meeting.date), "dd 'de' MMM", { locale: ptBR })}
                  </span>
                </div>
                <h3 className="meeting-title">{meeting.title}</h3>
                <div className="meeting-meta">
                  <span>📍 {meeting.location}</span>
                  <span>🕐 {meeting.startTime}</span>
                </div>
                {isAdmin && (
                  <div className="meeting-organizer">👤 {meeting.organizer?.name}</div>
                )}
                <div className="meeting-attendees">
                  👥 {meeting.attendees.length} participante{meeting.attendees.length !== 1 ? 's' : ''}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
