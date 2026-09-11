const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  meeting: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MiniMeeting',
    required: true,
    index: true
  },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  crm: { type: String, trim: true },
  crmUf: { type: String, trim: true, uppercase: true },
  crmVerified: { type: Boolean },
  phone: { type: String, trim: true },
  city: { type: String, trim: true },
  signature: { type: String, select: false },
  hasSignature: { type: Boolean, default: false },
  checkinToken: { type: String, required: true },
  checkedIn: { type: Boolean, default: false },
  checkedInAt: { type: Date },
  registeredAt: { type: Date, default: Date.now }
}, { timestamps: true });

attendanceSchema.index({ meeting: 1, email: 1 }, { unique: true });
attendanceSchema.index({ checkinToken: 1 }, { unique: true });
attendanceSchema.index({ meeting: 1, registeredAt: -1 });
attendanceSchema.index({ meeting: 1, crm: 1, crmUf: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);