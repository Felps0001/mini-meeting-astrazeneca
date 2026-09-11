const mongoose = require('mongoose');

const miniMeetingSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  location: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String },
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  attendeeCount: { type: Number, default: 0 },
  checkedInCount: { type: Number, default: 0 },
  inviteToken: { type: String, unique: true },
  status: { type: String, enum: ['ativo', 'encerrado', 'cancelado'], default: 'ativo' },
  createdAt: { type: Date, default: Date.now }
});

miniMeetingSchema.index({ organizer: 1, date: -1 });
miniMeetingSchema.index({ status: 1, date: -1 });

module.exports = mongoose.model('MiniMeeting', miniMeetingSchema);
