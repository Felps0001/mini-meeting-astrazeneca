const { v4: uuidv4 } = require('uuid');
const MiniMeeting = require('../models/MiniMeeting');
const Attendance = require('../models/Attendance');

async function migrateAttendees() {
  const cursor = MiniMeeting.collection.find({ 'attendees.0': { $exists: true } });
  let migratedMeetings = 0;
  let migratedAttendances = 0;

  for await (const meeting of cursor) {
    const attendees = Array.isArray(meeting.attendees) ? meeting.attendees : [];
    if (attendees.length === 0) continue;

    const operations = attendees.map((attendee) => ({
      updateOne: {
        filter: { _id: attendee._id },
        update: {
          $set: {
            meeting: meeting._id,
            name: attendee.name,
            email: attendee.email,
            crm: attendee.crm,
            crmUf: attendee.crmUf,
            crmVerified: attendee.crmVerified,
            phone: attendee.phone,
            city: attendee.city,
            signature: attendee.signature,
            hasSignature: Boolean(attendee.signature),
            checkinToken: attendee.checkinToken || uuidv4(),
            checkedIn: Boolean(attendee.checkedIn),
            checkedInAt: attendee.checkedInAt,
            registeredAt: attendee.registeredAt || new Date()
          }
        },
        upsert: true
      }
    }));

    await Attendance.bulkWrite(operations, { ordered: false });
    await MiniMeeting.collection.updateOne(
      { _id: meeting._id },
      {
        $set: {
          attendeeCount: attendees.length,
          checkedInCount: attendees.filter((attendee) => attendee.checkedIn).length
        },
        $unset: { attendees: '' }
      }
    );

    migratedMeetings++;
    migratedAttendances += attendees.length;
  }

  if (migratedMeetings > 0) {
    console.log(`Migração concluída: ${migratedAttendances} participantes em ${migratedMeetings} eventos`);
  }
}

if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
  const mongoose = require('mongoose');

  mongoose.connect(process.env.MONGO_URI)
    .then(migrateAttendees)
    .then(() => mongoose.disconnect())
    .catch((error) => {
      console.error('Erro ao migrar participantes:', error);
      process.exit(1);
    });
}

module.exports = migrateAttendees;