import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import Navbar from '../components/Navbar';
import { format } from 'date-fns';
import './MeetingForm.css';

const MeetingForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm] = useState({
    title: '',
    description: '',
    location: '',
    date: '',
    startTime: '',
    endTime: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEdit) {
      api.get(`/meetings/${id}`).then(res => {
        const m = res.data;
        setForm({
          title: m.title,
          description: m.description || '',
          location: m.location,
          date: format(new Date(m.date), 'yyyy-MM-dd'),
          startTime: m.startTime,
          endTime: m.endTime || ''
        });
      }).catch(() => setError('Erro ao carregar meeting'));
    }
  }, [id, isEdit]);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isEdit) {
        await api.put(`/meetings/${id}`, form);
      } else {
        await api.post('/meetings', form);
      }
      navigate('/meetings');
    } catch (err) {
      setError(err.response?.data?.message || 'Erro ao salvar meeting');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-layout">
      <Navbar />
      <main className="main-content">
        <div className="page-header">
          <h1>{isEdit ? 'Editar Meeting' : 'Novo Mini-Meeting'}</h1>
        </div>

        <div className="form-card">
          <form onSubmit={handleSubmit} className="meeting-form">
            <div className="form-group">
              <label>Título *</label>
              <input name="title" value={form.title} onChange={handleChange} placeholder="Ex: Alinhamento de equipe" required />
            </div>

            <div className="form-group">
              <label>Descrição</label>
              <textarea name="description" value={form.description} onChange={handleChange} placeholder="Descreva o objetivo do meeting..." rows={3} />
            </div>

            <div className="form-group">
              <label>Local *</label>
              <input name="location" value={form.location} onChange={handleChange} placeholder="Ex: Sala de Reuniões 2 - Bloco A" required />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Data *</label>
                <input type="date" name="date" value={form.date} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label>Horário de início *</label>
                <input type="time" name="startTime" value={form.startTime} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label>Horário de término</label>
                <input type="time" name="endTime" value={form.endTime} onChange={handleChange} />
              </div>
            </div>

            {error && <div className="error-msg">{error}</div>}

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => navigate('/meetings')}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar evento'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default MeetingForm;
