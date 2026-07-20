const mongoose = require('mongoose');

// Histórico de participação do médico em cada meeting. Serve de base para as
// estatísticas (convidado x compareceu) e evita contagem duplicada.
const doctorMeetingSchema = new mongoose.Schema({
  meeting: { type: mongoose.Schema.Types.ObjectId, ref: 'MiniMeeting', required: true },
  meetingTitle: { type: String, trim: true },
  registeredAt: { type: Date, default: Date.now },
  attended: { type: Boolean, default: false },
  attendedAt: { type: Date }
}, { _id: false });

// Collection de médicos já validados. Funciona como cache persistente da
// validação de CRM (para não reconsultar o CFM a cada inscrição) e acumula
// dados do profissional e estatísticas de participação.
const doctorSchema = new mongoose.Schema({
  crm: { type: String, required: true, trim: true },
  crmUf: { type: String, required: true, uppercase: true, trim: true },

  // Dados do CFM (via Infosimples)
  name: { type: String, trim: true },
  situation: { type: String, trim: true },              // situacao (ex.: "Ativo")
  crmVerified: { type: Boolean, default: false },
  graduationYear: { type: Number },                     // ano_formatura
  graduationInstitution: { type: String, trim: true },  // instituicao_graduacao
  specialty: { type: String, trim: true },              // especialidade
  registrationDate: { type: String, trim: true },       // inscricao_data

  // Último contato conhecido (preenchido nas inscrições)
  email: { type: String, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  city: { type: String, trim: true },

  // Participação
  meetings: [doctorMeetingSchema],
  stats: {
    invited: { type: Number, default: 0 },   // meetings em que se inscreveu
    attended: { type: Number, default: 0 }   // meetings com check-in confirmado
  },

  lastValidatedAt: { type: Date }
}, { timestamps: true });

doctorSchema.index({ crm: 1, crmUf: 1 }, { unique: true });

// Cria/atualiza o médico a partir de uma validação de CRM bem-sucedida.
// Só sobrescreve campos do CFM quando a validação foi confirmada (verified).
doctorSchema.statics.upsertFromValidation = async function (crmNum, ufUpper, result) {
  const set = { crm: crmNum, crmUf: ufUpper, lastValidatedAt: new Date() };
  if (result.valid === true) {
    if (result.name != null) set.name = result.name;
    if (result.situation != null) set.situation = result.situation;
    if (result.verified) set.crmVerified = true;
    if (result.graduationYear != null) set.graduationYear = result.graduationYear;
    if (result.graduationInstitution != null) set.graduationInstitution = result.graduationInstitution;
    if (result.specialty != null) set.specialty = result.specialty;
    if (result.registrationDate != null) set.registrationDate = result.registrationDate;
  }
  return this.findOneAndUpdate(
    { crm: crmNum, crmUf: ufUpper },
    { $set: set, $setOnInsert: { stats: { invited: 0, attended: 0 } } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

// Registra a inscrição do médico num meeting. Idempotente por meeting: se o
// médico já estava inscrito nesse meeting, não conta de novo.
doctorSchema.statics.recordRegistration = async function ({ crmNum, ufUpper, meetingId, meetingTitle, name, email, phone, city }) {
  // Contato mais recente. NÃO sobrescreve `name`: esse campo guarda o nome
  // oficial do CFM. O nome digitado no formulário só é usado como fallback,
  // aplicado apenas na criação do documento (setOnInsert).
  const contact = {};
  if (email) contact.email = email.toLowerCase();
  if (phone) contact.phone = phone;
  if (city) contact.city = city;

  const onInsert = { crm: crmNum, crmUf: ufUpper };
  if (name) onInsert.name = name;

  // Garante que o documento exista e atualiza o contato mais recente.
  await this.updateOne(
    { crm: crmNum, crmUf: ufUpper },
    { $set: contact, $setOnInsert: onInsert },
    { upsert: true }
  );

  // Adiciona o meeting só se ainda não estiver na lista (evita duplicar).
  const added = await this.updateOne(
    { crm: crmNum, crmUf: ufUpper, 'meetings.meeting': { $ne: meetingId } },
    {
      $push: { meetings: { meeting: meetingId, meetingTitle, registeredAt: new Date() } },
      $inc: { 'stats.invited': 1 }
    }
  );
  return added.modifiedCount > 0;
};

// Marca presença (check-in) do médico num meeting. Idempotente: só conta uma vez.
doctorSchema.statics.recordAttendance = async function ({ crmNum, ufUpper, meetingId }) {
  const updated = await this.updateOne(
    { crm: crmNum, crmUf: ufUpper, 'meetings.meeting': meetingId, 'meetings.attended': { $ne: true } },
    {
      $set: { 'meetings.$.attended': true, 'meetings.$.attendedAt': new Date() },
      $inc: { 'stats.attended': 1 }
    }
  );
  return updated.modifiedCount > 0;
};

module.exports = mongoose.model('Doctor', doctorSchema);
