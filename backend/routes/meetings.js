const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const MiniMeeting = require('../models/MiniMeeting');
const Attendance = require('../models/Attendance');
const Doctor = require('../models/Doctor');
const { generateMeetingCode } = require('../utils/meetingCode');
const { sendRegistrationConfirmationEmail } = require('../utils/mailer');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// GET /api/meetings - admin vê todos, user vê só os seus
router.get('/', authMiddleware, async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { organizer: req.user.id };
    const meetings = await MiniMeeting.find(filter)
      .select('-__v')
      .populate('organizer', 'name email')
      .sort({ date: -1 })
      .lean();
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

// Registra apenas as estatísticas locais dos médicos importados. A validação
// externa de CRM é iniciada manualmente na página do evento.
async function processImportedAttendees(meetingId, meetingTitle, entries) {
  for (const e of entries) {
    if (!e.crm || !e.crmUf) continue;

    try {
      await Doctor.recordRegistration({
        crmNum: e.crm, ufUpper: e.crmUf, meetingId, meetingTitle,
        name: e.name, email: e.email, phone: e.phone, city: e.city
      });
    } catch { /* estatística não deve interromper o processamento */ }

  }
}

async function createMeetingWithUniqueCode(data) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await MiniMeeting.create({ ...data, code: generateMeetingCode() });
    } catch (error) {
      if (error?.code !== 11000 || !error?.keyPattern?.code) throw error;
    }
  }
  throw new Error('Não foi possível gerar um código único para o meeting');
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
    const meeting = await MiniMeeting.findById(req.params.id)
      .populate('organizer', 'name email')
      .lean();
    if (!meeting) return res.status(404).json({ message: 'Meeting não encontrado' });

    if (req.user.role !== 'admin' && meeting.organizer._id.toString() !== req.user.id)
      return res.status(403).json({ message: 'Acesso negado' });

    const attendees = req.query.includeAttendees === 'false'
      ? undefined
      : await Attendance.find({ meeting: meeting._id })
        .select('-__v')
        .sort({ registeredAt: 1 })
        .lean();

    res.json(attendees ? { ...meeting, attendees } : meeting);
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
    const receptionToken = uuidv4();

    const meeting = await createMeetingWithUniqueCode({
      title, description, location, date, startTime, endTime,
      organizer: req.user.id,
      inviteToken,
      receptionToken
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
    const attendees = await Attendance.find({ meeting: meeting._id })
      .select('-__v')
      .sort({ registeredAt: 1 })
      .lean();
    res.json({ ...meeting.toObject(), attendees });
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
    await Attendance.deleteMany({ meeting: meeting._id });
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

    const attendee = await Attendance.findOneAndDelete({
      _id: req.params.attendeeId,
      meeting: meeting._id
    });
    if (!attendee) return res.status(404).json({ message: 'Participante não encontrado' });

    const decrement = { attendeeCount: -1 };
    if (attendee.checkedIn) decrement.checkedInCount = -1;
    await MiniMeeting.updateOne({ _id: meeting._id }, { $inc: decrement });

    res.json({ message: 'Inscrição cancelada com sucesso' });
  } catch {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// GET /api/meetings/:id/attendees/:attendeeId/signature
// A imagem pesada só é carregada quando o usuário abre o modal.
router.get('/:id/attendees/:attendeeId/signature', authMiddleware, async (req, res) => {
  try {
    const meeting = await MiniMeeting.findById(req.params.id).select('organizer');
    if (!meeting) return res.status(404).json({ message: 'Meeting não encontrado' });

    if (req.user.role !== 'admin' && meeting.organizer.toString() !== req.user.id)
      return res.status(403).json({ message: 'Acesso negado' });

    const attendee = await Attendance.findOne({
      _id: req.params.attendeeId,
      meeting: meeting._id
    }).select('+signature name');

    if (!attendee) return res.status(404).json({ message: 'Participante não encontrado' });
    if (!attendee.signature) return res.status(404).json({ message: 'Assinatura não encontrada' });

    res.json({ name: attendee.name, signature: attendee.signature });
  } catch {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// POST /api/meetings/:id/attendees/:attendeeId/verify-crm
router.post('/:id/attendees/:attendeeId/verify-crm', authMiddleware, async (req, res) => {
  try {
    const meeting = await MiniMeeting.findById(req.params.id).select('organizer');
    if (!meeting) return res.status(404).json({ message: 'Meeting não encontrado' });

    if (req.user.role !== 'admin' && meeting.organizer.toString() !== req.user.id)
      return res.status(403).json({ message: 'Acesso negado' });

    const attendee = await Attendance.findOne({
      _id: req.params.attendeeId,
      meeting: meeting._id
    });
    if (!attendee) return res.status(404).json({ message: 'Participante não encontrado' });
    if (!attendee.crm || !attendee.crmUf)
      return res.status(400).json({ message: 'Participante não possui CRM cadastrado' });

    const result = await verifyCRM(attendee.crm, attendee.crmUf);
    if (result.unavailable)
      return res.json({ crmVerified: null, unavailable: true, name: null });

    attendee.crmVerified = result.valid === true;
    if (attendee.crmVerified && result.name) attendee.name = result.name;
    await attendee.save();

    res.json({
      crmVerified: attendee.crmVerified,
      unavailable: false,
      name: result.name || null
    });
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

    // Normaliza os dados de cada linha uma única vez.
    const normalized = attendees.map((a) => ({
      name: a.name ? String(a.name).trim() : '',
      email: a.email ? String(a.email).toLowerCase().trim() : '',
      crm: a.crm ? String(a.crm).replace(/\D/g, '') : '',
      crmUf: a.crmUf ? String(a.crmUf).trim().toUpperCase() : '',
      phone: a.phone ? String(a.phone).trim() : '',
      city: a.city ? String(a.city).trim() : ''
    }));

    // Consulta o nosso banco (collection Doctor) de uma vez só para reaproveitar
    // médicos já conhecidos: se já foram validados antes, entram como verificados
    // na hora, sem custo e sem reconsultar o CFM.
    const crmPairs = normalized
      .filter((a) => a.crm && a.crmUf)
      .map((a) => ({ crm: a.crm, crmUf: a.crmUf }));
    const knownMap = new Map();
    if (crmPairs.length > 0) {
      const known = await Doctor.find({ $or: crmPairs });
      known.forEach((d) => knownMap.set(`${d.crmUf}:${d.crm}`, d));
    }

    const existingEmails = new Set(
      (await Attendance.find({
        meeting: meeting._id,
        email: { $in: normalized.map((attendee) => attendee.email).filter(Boolean) }
      }).select('email').lean()).map((attendee) => attendee.email)
    );
    const queuedEmails = new Set();
    const documents = [];
    const errors = [];
    let skipped = 0;

    for (let i = 0; i < normalized.length; i++) {
      const a = normalized[i];
      const row = i + 2;

      if (!a.name || !a.email) {
        errors.push(`Linha ${row}: nome e email são obrigatórios`);
        continue;
      }

      if (existingEmails.has(a.email) || queuedEmails.has(a.email)) {
        skipped++;
        continue;
      }

      let crmVerified;
      let name = a.name;
      let needsValidation = false;

      if (a.crm && a.crmUf) {
        const known = knownMap.get(`${a.crmUf}:${a.crm}`);
        if (known && known.crmVerified) {
          // Médico já validado no nosso banco: aproveita e usa o nome oficial do CFM.
          crmVerified = true;
          if (known.name) name = known.name;
        } else {
          // Desconhecido/não verificado: fica pendente para verificação manual.
          needsValidation = true;
        }
      }

      documents.push({
        meeting: meeting._id,
        name,
        email: a.email,
        crm: a.crm || undefined,
        crmUf: a.crmUf || undefined,
        crmVerified,
        phone: a.phone || undefined,
        city: a.city || undefined,
        checkinToken: uuidv4()
      });
      queuedEmails.add(a.email);
    }

    const created = documents.length > 0
      ? await Attendance.insertMany(documents, { ordered: false })
      : [];
    if (created.length > 0) {
      await MiniMeeting.updateOne(
        { _id: meeting._id },
        { $inc: { attendeeCount: created.length } }
      );
    }

    const statsEntries = documents
      .filter((attendee) => attendee.crm && attendee.crmUf)
      .map((attendee) => ({ ...attendee, needsValidation: attendee.crmVerified == null }));
    processImportedAttendees(meeting._id, meeting.title, statsEntries).catch(() => {});

    const pendingVerification = statsEntries.filter((entry) => entry.needsValidation).length;
    res.json({ inserted: created.length, skipped, errors, pendingVerification });
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
      .select('title status')
      .lean();
    if (!meeting)
      return res.status(404).json({ message: 'Evento não encontrado' });

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const crmDigits = q.replace(/\D/g, '');
    const searchFields = [
      { name: regex },
      { email: regex }
    ];
    if (crmDigits) searchFields.push({ crm: new RegExp(crmDigits) });
    const attendees = await Attendance.find({
      meeting: meeting._id,
      $or: searchFields
    }).limit(8).lean();
    const matches = attendees.map(a => ({
        id: a._id,
        name: a.name,
        email: a.email.replace(/(.{2}).+(@.+)/, '$1***$2'),
        crm: a.crm || null,
        crmUf: a.crmUf || null,
        checkinToken: a.checkinToken,
        checkedIn: a.checkedIn
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
      code: meeting.code,
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

// GET /api/meetings/reception/:token - dados da tela de recepção exclusiva do evento
router.get('/reception/:token', async (req, res) => {
  try {
    const meeting = await MiniMeeting.findOne({ receptionToken: req.params.token })
      .select('title code location date startTime endTime status attendeeCount checkedInCount')
      .lean();
    if (!meeting || meeting.status !== 'ativo')
      return res.status(404).json({ message: 'Recepção indisponível para este evento' });
    res.json(meeting);
  } catch {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// GET /api/meetings/reception/:token/attendees?q= - busca limitada ao evento da recepção
router.get('/reception/:token/attendees', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < 2)
      return res.status(400).json({ message: 'Digite ao menos 2 caracteres' });

    const meeting = await MiniMeeting.findOne({ receptionToken: req.params.token })
      .select('_id status');
    if (!meeting || meeting.status !== 'ativo')
      return res.status(404).json({ message: 'Recepção indisponível para este evento' });

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const search = [{ name: new RegExp(escapedQuery, 'i') }, { email: new RegExp(escapedQuery, 'i') }];
    const crmDigits = query.replace(/\D/g, '');
    if (crmDigits) search.push({ crm: new RegExp(crmDigits) });

    const attendees = await Attendance.find({ meeting: meeting._id, $or: search })
      .select('name email crm crmUf checkedIn checkedInAt')
      .sort({ name: 1 })
      .limit(12)
      .lean();
    res.json({ results: attendees });
  } catch {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// GET /api/meetings/reception/:token/lookup-token/:checkinToken - QR limitado ao evento
router.get('/reception/:token/lookup-token/:checkinToken', async (req, res) => {
  try {
    const meeting = await MiniMeeting.findOne({ receptionToken: req.params.token })
      .select('_id status');
    if (!meeting || meeting.status !== 'ativo')
      return res.status(404).json({ message: 'Recepção indisponível para este evento' });

    const attendee = await Attendance.findOne({
      meeting: meeting._id,
      checkinToken: req.params.checkinToken
    }).select('name email crm crmUf checkedIn checkedInAt').lean();
    if (!attendee) return res.status(404).json({ message: 'Participante não encontrado' });
    res.json({ attendee });
  } catch {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// POST /api/meetings/reception/:token/checkin/:attendeeId - check-in escopado ao evento
router.post('/reception/:token/checkin/:attendeeId', async (req, res) => {
  try {
    const meeting = await MiniMeeting.findOne({ receptionToken: req.params.token })
      .select('_id status title');
    if (!meeting || meeting.status !== 'ativo')
      return res.status(404).json({ message: 'Recepção indisponível para este evento' });

    const { signature } = req.body;
    const update = { checkedIn: true, checkedInAt: new Date() };
    if (signature && typeof signature === 'string' && signature.startsWith('data:image/') && signature.length <= 5 * 1024 * 1024) {
      update.signature = signature;
      update.hasSignature = true;
    }

    const attendee = await Attendance.findOneAndUpdate(
      { _id: req.params.attendeeId, meeting: meeting._id, checkedIn: false },
      { $set: update },
      { new: true }
    );
    if (!attendee) {
      const existing = await Attendance.findOne({ _id: req.params.attendeeId, meeting: meeting._id })
        .select('name checkedIn checkedInAt');
      if (!existing) return res.status(404).json({ message: 'Participante não encontrado' });
      return res.json({ alreadyCheckedIn: true, attendee: existing });
    }

    await MiniMeeting.updateOne({ _id: meeting._id }, { $inc: { checkedInCount: 1 } });
    if (attendee.crm && attendee.crmUf) {
      try {
        await Doctor.recordAttendance({ crmNum: attendee.crm, ufUpper: attendee.crmUf, meetingId: meeting._id });
      } catch { /* estatística não deve impedir o check-in */ }
    }
    res.json({ attendee: { name: attendee.name, checkedInAt: attendee.checkedInAt } });
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

    const meeting = await MiniMeeting.findOne({ inviteToken: req.params.token });
    if (!meeting || meeting.status !== 'ativo')
      return res.status(404).json({ message: 'Evento não encontrado ou encerrado' });

    const alreadyRegistered = await Attendance.exists({
      meeting: meeting._id,
      email: email.toLowerCase()
    });
    if (alreadyRegistered)
      return res.status(400).json({ message: 'Este email já está inscrito neste evento' });

    // Validação real de CRM (solução B):
    // - CRM realmente não encontrado => bloqueia.
    // - Fonte indisponível (CFM lento/fora) => aceita e marca como não verificado.
    // - Confirmado => marca como verificado.
    const cfmResult = await verifyCRM(crmNum, ufUpper);
    if (cfmResult.valid === false)
      return res.status(400).json({ message: cfmResult.message || 'CRM não encontrado ou inválido no CFM' });
    const crmVerified = cfmResult.valid === true;

    const checkinToken = uuidv4();
    await Attendance.create({
      meeting: meeting._id,
      name,
      email: email.toLowerCase(),
      phone,
      city,
      crm: crmNum,
      crmUf: ufUpper,
      crmVerified,
      checkinToken
    });
    await MiniMeeting.updateOne(
      { _id: meeting._id },
      { $inc: { attendeeCount: 1 } }
    );

    // Registra a inscrição na collection de médicos (estatísticas + contato).
    try {
      await Doctor.recordRegistration({
        crmNum, ufUpper, meetingId: meeting._id, meetingTitle: meeting.title,
        name, email, phone, city
      });
    } catch { /* estatística não deve quebrar a inscrição */ }

    const clientUrl = (process.env.CLIENT_URL || '').replace(/\/$/, '');
    const qrCodeLink = `${clientUrl}/event/${meeting.inviteToken}/qrcode`;
    try {
      await sendRegistrationConfirmationEmail({
        toEmail: email.toLowerCase(),
        attendeeName: name,
        meeting,
        qrCodeLink
      });
    } catch (error) {
      console.error('Erro ao enviar confirmação de inscrição:', error.message);
    }

    res.json({ message: 'Inscrição realizada com sucesso!', checkinToken });
  } catch (error) {
    if (error?.code === 11000)
      return res.status(400).json({ message: 'Este email já está inscrito neste evento' });
    res.status(500).json({ message: 'Erro interno' });
  }
});

// GET /api/meetings/lookup-token/:checkinToken - retorna dados do participante pelo
// token de check-in sem confirmar presença. Usado para exibir o nome antes de coletar
// a assinatura no scanner/QRLookup.
router.get('/lookup-token/:checkinToken', async (req, res) => {
  try {
    const attendee = await Attendance.findOne({ checkinToken: req.params.checkinToken }).lean();
    if (!attendee) return res.status(404).json({ message: 'Participante não encontrado' });

    res.json({
      name: attendee.name,
      email: attendee.email,
      crm: attendee.crm || null,
      crmUf: attendee.crmUf || null,
      alreadyCheckedIn: !!attendee.checkedIn
    });
  } catch {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// POST /api/meetings/checkin/:checkinToken - confirmar presença via token único
router.post('/checkin/:checkinToken', async (req, res) => {
  try {
    const { signature } = req.body;
    const update = {
      checkedIn: true,
      checkedInAt: new Date()
    };
    if (signature && typeof signature === 'string' && signature.startsWith('data:image/') && signature.length <= 5 * 1024 * 1024) {
      update.signature = signature;
      update.hasSignature = true;
    }

    const attendee = await Attendance.findOneAndUpdate(
      { checkinToken: req.params.checkinToken, checkedIn: false },
      { $set: update },
      { new: true }
    );

    if (!attendee) {
      const existing = await Attendance.findOne({ checkinToken: req.params.checkinToken });
      if (!existing) return res.status(404).json({ message: 'Token de check-in inválido' });
      const meeting = await MiniMeeting.findById(existing.meeting).select('title').lean();
      return res.json({
        message: 'Check-in já realizado',
        alreadyCheckedIn: true,
        attendee: { name: existing.name, email: existing.email, checkedInAt: existing.checkedInAt },
        event: { title: meeting?.title || '' }
      });
    }

    const meeting = await MiniMeeting.findByIdAndUpdate(
      attendee.meeting,
      { $inc: { checkedInCount: 1 } },
      { new: true }
    ).lean();
    if (!meeting) return res.status(404).json({ message: 'Evento não encontrado' });

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
