const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const MiniMeeting = require('../models/MiniMeeting');
const Doctor = require('../models/Doctor');
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

// GET /api/meetings/validate-crm?crm=123456&uf=SP  — validação real de CRM (backend-only)
const VALID_UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

// Cache em memória para evitar reconsultar o mesmo CRM repetidamente.
// Resultados válidos/invalidos são cacheados; indisponibilidade não é cacheada.
const CRM_CACHE_TTL_VALID = 7 * 24 * 60 * 60 * 1000; // 7 dias
const CRM_CACHE_TTL_INVALID = 60 * 60 * 1000;        // 1 hora
const crmCache = new Map();

function getCachedCRM(key) {
  const entry = crmCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    crmCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCachedCRM(key, result) {
  if (result.unavailable) return; // nunca cacheia indisponibilidade
  const ttl = result.valid ? CRM_CACHE_TTL_VALID : CRM_CACHE_TTL_INVALID;
  crmCache.set(key, { result, expiresAt: Date.now() + ttl });
}

// Fonte 1 (gratuita): API pública do CFM. Faz algumas tentativas pois é instável.
async function fetchFromCFM(crmNum, ufUpper) {
  const attempts = 3;
  let sawError = false;
  for (let i = 0; i < attempts; i++) {
    try {
      const { data, status } = await axios.get(
        `https://www.sistemas.cfm.org.br/api/publico/consulta/medico/${crmNum}/${ufUpper}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://portal.cfm.org.br/',
            'Origin': 'https://portal.cfm.org.br'
          },
          timeout: 10000,
          validateStatus: () => true
        }
      );
      if (status === 404) return { valid: false, message: 'CRM não encontrado para esta UF' };
      if (status === 200 && data) {
        return { valid: true, name: data.nomeMedico || null, situation: data.situacao || null };
      }
      sawError = true; // status inesperado (403/429/5xx) — tenta de novo
    } catch {
      sawError = true; // timeout / rede — tenta de novo
    }
  }
  return { unavailable: true, sawError };
}

// Fonte 2 (paga): Infosimples. É usada como fonte primária quando INFOSIMPLES_TOKEN
// está configurado, pois a API pública gratuita do CFM passou a exigir reCAPTCHA e
// não funciona mais para validação servidor-a-servidor.
// Doc: https://api.infosimples.com/consultas/docs/pt-BR/cfm/cadastro.md
async function fetchFromInfosimples(crmNum, ufUpper) {
  const token = process.env.INFOSIMPLES_TOKEN;
  if (!token) return { unavailable: true };
  const url = process.env.INFOSIMPLES_CRM_URL
    || 'https://api.infosimples.com/api/v2/consultas/cfm/cadastro';
  try {
    const body = new URLSearchParams({
      token,
      inscricao: crmNum,
      uf: ufUpper,
      timeout: '60'
    });
    const { data, status } = await axios.post(url, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 70000,
      validateStatus: () => true
    });
    if (status !== 200 || !data) return { unavailable: true };

    // code 200 = sucesso. data[] preenchido = médico encontrado.
    if (data.code === 200 && Array.isArray(data.data) && data.data.length > 0) {
      const rec = data.data[0];
      return {
        valid: true,
        name: rec.nome || null,
        situation: rec.situacao || null,
        graduationYear: rec.ano_formatura || null,
        graduationInstitution: rec.instituicao_graduacao || null,
        specialty: rec.especialidade || null,
        registrationDate: rec.inscricao_data || null
      };
    }
    // 200 sem dados ou 612 = consulta sem resultados => CRM não encontrado.
    if (data.code === 200 || data.code === 612) {
      return { valid: false, message: 'CRM não encontrado para esta UF' };
    }
    // Demais códigos 6xx/7xx = fonte indisponível/instável => não confirma.
    return { unavailable: true };
  } catch {
    return { unavailable: true };
  }
}

async function verifyCRM(crmNum, ufUpper) {
  const key = `${ufUpper}:${crmNum}`;
  const cached = getCachedCRM(key);
  if (cached) return cached;

  // Cache persistente: se o médico já foi validado antes (collection Doctor),
  // reaproveita sem reconsultar o CFM.
  try {
    const known = await Doctor.findOne({ crm: crmNum, crmUf: ufUpper });
    if (known && known.crmVerified) {
      const result = {
        valid: true,
        verified: true,
        name: known.name || null,
        situation: known.situation || null,
        specialty: known.specialty || null,
        graduationInstitution: known.graduationInstitution || null,
        graduationYear: known.graduationYear || null,
        registrationDate: known.registrationDate || null,
        fromCache: true
      };
      setCachedCRM(key, result);
      return result;
    }
  } catch { /* falha ao ler cache persistente não deve bloquear a validação */ }

  // Com token configurado, a Infosimples é a fonte real (a API pública do CFM
  // exige reCAPTCHA e não valida mais). Sem token, tenta o CFM legado (que tende
  // a ficar indisponível e resultará em 503 — sem aceitar CRM por engano).
  let result;
  if (process.env.INFOSIMPLES_TOKEN) {
    // A fonte do CFM (via Infosimples) é lenta e instável e frequentemente
    // devolve timeout (code 605). Como uma nova tentativa costuma resolver,
    // repetimos algumas vezes enquanto o resultado vier como indisponível.
    const attempts = 3;
    for (let i = 0; i < attempts; i++) {
      result = await fetchFromInfosimples(crmNum, ufUpper);
      if (!result.unavailable) break;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500));
    }
  } else {
    result = await fetchFromCFM(crmNum, ufUpper);
  }

  setCachedCRM(key, result);

  // Persiste/atualiza o médico quando a validação foi confirmada de verdade.
  if (result.valid === true) {
    try {
      await Doctor.upsertFromValidation(crmNum, ufUpper, { ...result, verified: true });
    } catch { /* não bloquear o fluxo por erro ao gravar o cache persistente */ }
  }

  return result;
}

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

  const result = await verifyCRM(crmNum, ufUpper);

  // Fonte indisponível (ex.: CFM lento): não bloqueia. Permite seguir, mas sinaliza
  // que o CRM não pôde ser confirmado (será marcado como não verificado).
  if (result.unavailable)
    return res.json({
      valid: true,
      verified: false,
      unverified: true,
      message: 'CRM não pôde ser confirmado no CFM agora — a inscrição será registrada e revisada.'
    });

  // CRM realmente não encontrado: bloqueia.
  if (result.valid === false)
    return res.json({ valid: false, message: result.message || 'CRM não encontrado' });

  // Confirmado no CFM. Retorna os dados públicos do médico para exibir no card.
  return res.json({
    valid: true,
    verified: true,
    name: result.name || null,
    doctor: {
      name: result.name || null,
      situation: result.situation || null,
      specialty: result.specialty || null,
      graduationInstitution: result.graduationInstitution || null,
      graduationYear: result.graduationYear || null,
      registrationDate: result.registrationDate || null,
      crm: crmNum,
      crmUf: ufUpper
    }
  });
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
    if (status) {
      const validStatuses = ['ativo', 'encerrado', 'cancelado'];
      if (!validStatuses.includes(status))
        return res.status(400).json({ message: 'Status inválido' });
      if (status === 'ativo' && meeting.status !== 'ativo' && req.user.role !== 'admin')
        return res.status(403).json({ message: 'Não é possível reabrir um meeting encerrado ou cancelado' });
      meeting.status = status;
    }

    await meeting.save();
    await meeting.populate('organizer', 'name email');
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

// DELETE /api/meetings/:id/attendees/:attendeeId - cancela inscrição de um participante
router.delete('/:id/attendees/:attendeeId', authMiddleware, async (req, res) => {
  try {
    const meeting = await MiniMeeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting não encontrado' });

    if (req.user.role !== 'admin' && meeting.organizer.toString() !== req.user.id)
      return res.status(403).json({ message: 'Acesso negado' });

    const attendee = meeting.attendees.id(req.params.attendeeId);
    if (!attendee) return res.status(404).json({ message: 'Participante não encontrado' });

    attendee.deleteOne();
    await meeting.save();

    res.json({ message: 'Inscrição cancelada com sucesso' });
  } catch {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// POST /api/meetings/:id/attendees/bulk - importar participantes via CSV
router.post('/:id/attendees/bulk', authMiddleware, async (req, res) => {
  try {
    const meeting = await MiniMeeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting não encontrado' });

    if (req.user.role !== 'admin' && meeting.organizer.toString() !== req.user.id)
      return res.status(403).json({ message: 'Acesso negado' });

    const { attendees } = req.body;
    if (!Array.isArray(attendees) || attendees.length === 0)
      return res.status(400).json({ message: 'Lista de participantes inválida' });

    if (attendees.length > 500)
      return res.status(400).json({ message: 'Máximo de 500 participantes por importação' });

    let inserted = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < attendees.length; i++) {
      const { name, email, crm, crmUf, phone, city } = attendees[i];
      const row = i + 2;

      if (!name || !email) {
        errors.push(`Linha ${row}: nome e email são obrigatórios`);
        continue;
      }

      const emailLower = String(email).toLowerCase().trim();
      if (meeting.attendees.find(a => a.email === emailLower)) {
        skipped++;
        continue;
      }

      meeting.attendees.push({
        name: String(name).trim(),
        email: emailLower,
        crm: crm ? String(crm).replace(/\D/g, '') : undefined,
        crmUf: crmUf ? String(crmUf).trim().toUpperCase() : undefined,
        phone: phone ? String(phone).trim() : undefined,
        city: city ? String(city).trim() : undefined,
        checkinToken: uuidv4()
      });
      inserted++;
    }

    await meeting.save();
    res.json({ inserted, skipped, errors });
  } catch {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// GET /api/meetings/invite/:token/lookup?q= - busca pública de participante pelo nome/email
router.get('/invite/:token/lookup', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 3)
      return res.status(400).json({ message: 'Digite ao menos 3 caracteres' });

    const meeting = await MiniMeeting.findOne({ inviteToken: req.params.token })
      .select('title attendees status');
    if (!meeting)
      return res.status(404).json({ message: 'Evento não encontrado' });

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const matches = meeting.attendees
      .filter(a => regex.test(a.name) || regex.test(a.email))
      .slice(0, 8)
      .map(a => ({
        id: a._id,
        name: a.name,
        email: a.email.replace(/(.{2}).+(@.+)/, '$1***$2'),
        checkinToken: a.checkinToken,
        checkedIn: a.checkedIn,
      }));

    res.json({ eventTitle: meeting.title, results: matches });
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
    const { name, email, crm, crmUf, phone, city } = req.body;
    if (!name || !email)
      return res.status(400).json({ message: 'Nome e email são obrigatórios' });

    if (!phone)
      return res.status(400).json({ message: 'Telefone é obrigatório' });

    if (!city)
      return res.status(400).json({ message: 'Cidade é obrigatória' });

    if (!crm || !crmUf)
      return res.status(400).json({ message: 'CRM e UF são obrigatórios' });

    const crmNum = crm.replace(/\D/g, '');
    if (!/^\d{1,6}$/.test(crmNum))
      return res.status(400).json({ message: 'Número de CRM inválido' });

    const ufUpper = crmUf.trim().toUpperCase();
    if (!VALID_UFS.includes(ufUpper))
      return res.status(400).json({ message: 'UF inválida' });

    // Validação real de CRM (solução B):
    // - CRM realmente não encontrado => bloqueia.
    // - Fonte indisponível (CFM lento/fora) => aceita e marca como não verificado.
    // - Confirmado => marca como verificado.
    const cfmResult = await verifyCRM(crmNum, ufUpper);
    if (cfmResult.valid === false)
      return res.status(400).json({ message: cfmResult.message || 'CRM não encontrado ou inválido no CFM' });
    const crmVerified = cfmResult.valid === true;

    const meeting = await MiniMeeting.findOne({ inviteToken: req.params.token });
    if (!meeting || meeting.status !== 'ativo')
      return res.status(404).json({ message: 'Evento não encontrado ou encerrado' });

    const alreadyRegistered = meeting.attendees.find(a => a.email === email.toLowerCase());
    if (alreadyRegistered)
      return res.status(400).json({ message: 'Este email já está inscrito neste evento' });

    meeting.attendees.push({ name, email: email.toLowerCase(), phone, city, crm: crmNum, crmUf: ufUpper, crmVerified, checkinToken: uuidv4() });
    await meeting.save();

    // Registra a inscrição na collection de médicos (estatísticas + contato).
    try {
      await Doctor.recordRegistration({
        crmNum, ufUpper, meetingId: meeting._id, meetingTitle: meeting.title,
        name, email, phone, city
      });
    } catch { /* estatística não deve quebrar a inscrição */ }

    const newAttendee = meeting.attendees[meeting.attendees.length - 1];
    res.json({ message: 'Inscrição realizada com sucesso!', checkinToken: newAttendee.checkinToken });
  } catch {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// POST /api/meetings/checkin/:checkinToken - confirmar presença via token único
router.post('/checkin/:checkinToken', async (req, res) => {
  try {
    const meeting = await MiniMeeting.findOne({ 'attendees.checkinToken': req.params.checkinToken });
    if (!meeting) return res.status(404).json({ message: 'Token de check-in inválido' });

    const attendee = meeting.attendees.find(a => a.checkinToken === req.params.checkinToken);
    if (!attendee) return res.status(404).json({ message: 'Participante não encontrado' });

    if (attendee.checkedIn) {
      return res.json({
        message: 'Check-in já realizado',
        alreadyCheckedIn: true,
        attendee: { name: attendee.name, email: attendee.email, checkedInAt: attendee.checkedInAt },
        event: { title: meeting.title }
      });
    }

    attendee.checkedIn = true;
    attendee.checkedInAt = new Date();
    await meeting.save();

    // Contabiliza a presença na collection de médicos.
    if (attendee.crm && attendee.crmUf) {
      try {
        await Doctor.recordAttendance({ crmNum: attendee.crm, ufUpper: attendee.crmUf, meetingId: meeting._id });
      } catch { /* estatística não deve quebrar o check-in */ }
    }

    res.json({
      message: 'Check-in realizado com sucesso!',
      attendee: { name: attendee.name, email: attendee.email, crm: attendee.crm, crmUf: attendee.crmUf },
      event: { title: meeting.title, date: meeting.date, location: meeting.location }
    });
  } catch {
    res.status(500).json({ message: 'Erro interno' });
  }
});

module.exports = router;
