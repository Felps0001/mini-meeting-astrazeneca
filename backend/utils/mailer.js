const nodemailer = require('nodemailer');
const dns = require('dns');

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT),
    secure: Number(process.env.EMAIL_PORT) === 465,
    lookup: (hostname, options, callback) => dns.lookup(
      hostname,
      { ...options, family: 4 },
      callback
    ),
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const sendInviteEmail = async (toEmail, inviteLink, adminName) => {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"Mini-Meeting" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Convite para o Mini-Meeting Dashboard',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Você foi convidado!</h2>
        <p>${adminName} te convidou para acessar o Mini-Meeting Dashboard.</p>
        <p>Clique no botão abaixo para criar sua conta:</p>
        <a href="${inviteLink}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;font-weight:bold;">
          Criar Conta
        </a>
        <p style="color:#888;font-size:12px;margin-top:20px;">Este link expira em 48 horas.</p>
      </div>
    `
  });
};

const sendRegistrationConfirmationEmail = async ({ toEmail, attendeeName, meeting, qrCodeLink }) => {
  const transporter = createTransporter();
  const formattedDate = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long', timeZone: 'America/Sao_Paulo'
  }).format(new Date(meeting.date));
  const time = meeting.endTime
    ? `${meeting.startTime} às ${meeting.endTime}`
    : meeting.startTime;

  await transporter.sendMail({
    from: `"Mini-Meeting" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `Inscrição confirmada: ${meeting.title}`,
    text: [
      `Olá, ${attendeeName}.`,
      '',
      'Sua inscrição foi confirmada.',
      `Evento: ${meeting.title}`,
      `Código do evento: ${meeting.code}`,
      `Data: ${formattedDate}`,
      `Horário: ${time}`,
      `Local: ${meeting.location}`,
      '',
      `Acesse seu QR Code de check-in: ${qrCodeLink}`,
      'Apresente o QR Code na recepção do evento.'
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#241033;">
        <h2 style="margin:0 0 16px;color:#7b1fa2;">Inscrição confirmada</h2>
        <p>Olá, <strong>${escapeHtml(attendeeName)}</strong>.</p>
        <p>Sua inscrição foi confirmada. Guarde estas informações:</p>
        <div style="padding:18px;border:1px solid #e2cde8;border-radius:8px;background:#fcf8fd;">
          <p style="margin:0 0 8px;"><strong>${escapeHtml(meeting.title)}</strong></p>
          <p style="margin:0 0 6px;">Código do evento: <strong>${escapeHtml(meeting.code)}</strong></p>
          <p style="margin:0 0 6px;">Data: ${escapeHtml(formattedDate)}</p>
          <p style="margin:0 0 6px;">Horário: ${escapeHtml(time)}</p>
          <p style="margin:0;">Local: ${escapeHtml(meeting.location)}</p>
        </div>
        <p style="margin:24px 0 12px;">No dia do evento, apresente seu QR Code na recepção:</p>
        <a href="${escapeHtml(qrCodeLink)}" style="display:inline-block;padding:12px 18px;border-radius:6px;background:#7b1fa2;color:#ffffff;text-decoration:none;font-weight:bold;">Acessar meu QR Code</a>
        <p style="margin-top:22px;color:#6b6172;font-size:12px;">Este link não confirma presença. O check-in é realizado pela equipe na recepção.</p>
      </div>
    `
  });
};

module.exports = { sendInviteEmail, sendRegistrationConfirmationEmail };
