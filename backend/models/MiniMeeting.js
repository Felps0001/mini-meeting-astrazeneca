const mongoose = require('mongoose');

const attendeeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  crm: { type: String, trim: true },
  crmUf: { type: String, trim: true, uppercase: true },
  crmVerified: { type: Boolean },
  phone: { type: String, trim: true },
  city: { type: String, trim: true },
  signature: { type: String },
  checkinToken: { type: String },
  checkedIn: { type: Boolean, default: false },
  checkedInAt: { type: Date },
  registeredAt: { type: Date, default: Date.now }
});

const miniMeetingSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  location: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String },
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  attendees: [attendeeSchema],
  inviteToken: { type: String, unique: true },
  status: { type: String, enum: ['ativo', 'encerrado', 'cancelado'], default: 'ativo' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MiniMeeting', miniMeetingSchema);
