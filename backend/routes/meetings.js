const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const MiniMeeting = require('../models/MiniMeeting');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// GET /api/meetings - admin vê todos, user vê só os seus
router.get('/', authMiddleware, async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { organizer: req.user.id };
    const meetings = await MiniMeeting.find(filter)
      .populate('organizer', 'name email')
      .sort({ date: -1 });
    res.json(meetings);
  } catch {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// GET /api/meetings/validate-crm?crm=123456&uf=SP  — proxy público para API do CFM
const VALID_UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

router.get('/validate-crm', async (req, res) => {
  const { crm, uf } = req.query;
  if (!crm || !uf)
    return res.status(400).json({ message: 'CRM e UF são obrigatórios' });

  const crmNum = crm.replace(/\D/g, '');
  if (!/^\d{1,6}$/.test(crmNum))
    return res.status(400).json({ message: 'Número de CRM inválido' });

  const ufUpper = uf.trim().toUpperCase();
  if (!VALID_UFS.includes(ufUpper))
    return res.status(400).json({ message: 'UF inválida' });

  try {
    const cfmRes = await fetch(
      `https://www.sistemas.cfm.org.br/api/publico/consulta/medico/${crmNum}/${ufUpper}`
    );

    if (cfmRes.status === 404) {
      return res.json({ valid: false, message: 'CRM não encontrado' });
    }

    if (!cfmRes.ok) {
      return res.status(502).json({ message: 'Serviço do CFM indisponível. Tente novamente.' });
    }

    const data = await cfmRes.json();
    return res.json({
      valid: true,
      name: data.nomeMedico || null,
      situation: data.situacao || null
    });
  } catch {
    return res.status(502).json({ message: 'Não foi possível verificar o CRM. Tente novamente.' });
  }
});

// GET /api/meetings/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const meeting = await MiniMeeting.findById(req.params.id).populate('organizer', 'name email');
    if (!meeting) return res.status(404).json({ message: 'Meeting não encontrado' });

    if (req.user.role !== 'admin' && meeting.organizer._id.toString() !== req.user.id)
      return res.status(403).json({ message: 'Acesso negado' });

    res.json(meeting);
  } catch {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// POST /api/meetings - criar mini-meeting (1 ativo por usuário)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, location, date, startTime, endTime } = req.body;
    if (!title || !location || !date || !startTime)
      return res.status(400).json({ message: 'Título, local, data e horário são obrigatórios' });

    // Verificar se usuário já tem um meeting ativo
    if (req.user.role !== 'admin') {
      const activeCount = await MiniMeeting.countDocuments({
        organizer: req.user.id,
        status: 'ativo'
      });
      if (activeCount >= 1)
        return res.status(400).json({ message: 'Você já possui um mini-meeting ativo. Encerre-o antes de criar outro.' });
    }

    const inviteToken = uuidv4();

    const meeting = await MiniMeeting.create({
      title, description, location, date, startTime, endTime,
      organizer: req.user.id,
      inviteToken
    });

    res.status(201).json(meeting);
  } catch {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// PUT /api/meetings/:id - editar meeting
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const meeting = await MiniMeeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting não encontrado' });

    if (req.user.role !== 'admin' && meeting.organizer.toString() !== req.user.id)
      return res.status(403).json({ message: 'Acesso negado' });

    const { title, description, location, date, startTime, endTime, status } = req.body;
    if (title) meeting.title = title;
    if (description !== undefined) meeting.description = description;
    if (location) meeting.location = location;
    if (date) meeting.date = date;
    if (startTime) meeting.startTime = startTime;
    if (endTime !== undefined) meeting.endTime = endTime;
    if (status) meeting.status = status;

    await meeting.save();
    res.json(meeting);
  } catch {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// DELETE /api/meetings/:id - admin ou organizador
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const meeting = await MiniMeeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting não encontrado' });

    if (req.user.role !== 'admin' && meeting.organizer.toString() !== req.user.id)
      return res.status(403).json({ message: 'Acesso negado' });

    await meeting.deleteOne();
    res.json({ message: 'Meeting removido' });
  } catch {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// GET /api/meetings/invite/:token - dados públicos para formulário de inscrição
router.get('/invite/:token', async (req, res) => {
  try {
    const meeting = await MiniMeeting.findOne({ inviteToken: req.params.token })
      .populate('organizer', 'name');
    if (!meeting || meeting.status !== 'ativo')
      return res.status(404).json({ message: 'Evento não encontrado ou encerrado' });

    res.json({
      id: meeting._id,
      title: meeting.title,
      description: meeting.description,
      location: meeting.location,
      date: meeting.date,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      organizer: meeting.organizer.name
    });
  } catch {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// POST /api/meetings/invite/:token/register - inscrição pública
router.post('/invite/:token/register', async (req, res) => {
  try {
    const { name, email, crm, crmUf } = req.body;
    if (!name || !email)
      return res.status(400).json({ message: 'Nome e email são obrigatórios' });

    if (!crm || !crmUf)
      return res.status(400).json({ message: 'CRM e UF são obrigatórios' });

    const crmNum = crm.replace(/\D/g, '');
    if (!/^\d{1,6}$/.test(crmNum))
      return res.status(400).json({ message: 'Número de CRM inválido' });

    const ufUpper = crmUf.trim().toUpperCase();
    if (!VALID_UFS.includes(ufUpper))
      return res.status(400).json({ message: 'UF inválida' });

    // Validate CRM with CFM
    try {
      const cfmRes = await fetch(
        `https://www.sistemas.cfm.org.br/api/publico/consulta/medico/${crmNum}/${ufUpper}`
      );
      if (!cfmRes.ok)
        return res.status(400).json({ message: 'CRM não encontrado ou inválido no CFM' });
    } catch {
      return res.status(502).json({ message: 'Não foi possível verificar o CRM. Tente novamente.' });
    }

    const meeting = await MiniMeeting.findOne({ inviteToken: req.params.token });
    if (!meeting || meeting.status !== 'ativo')
      return res.status(404).json({ message: 'Evento não encontrado ou encerrado' });

    const alreadyRegistered = meeting.attendees.find(a => a.email === email.toLowerCase());
    if (alreadyRegistered)
      return res.status(400).json({ message: 'Este email já está inscrito neste evento' });

    meeting.attendees.push({ name, email: email.toLowerCase(), crm: crmNum, crmUf: ufUpper });
    await meeting.save();

    res.json({ message: 'Inscrição realizada com sucesso!' });
  } catch {
    res.status(500).json({ message: 'Erro interno' });
  }
});

module.exports = router;
