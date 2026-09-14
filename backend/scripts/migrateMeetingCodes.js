const MiniMeeting = require('../models/MiniMeeting');
const { generateMeetingCode } = require('../utils/meetingCode');

async function migrateMeetingCodes() {
  await MiniMeeting.init();

  const meetings = await MiniMeeting.find({
    $or: [{ code: { $exists: false } }, { code: null }, { code: '' }]
  }).select('_id');

  let updated = 0;
  for (const meeting of meetings) {
    let assigned = false;
    for (let attempt = 0; attempt < 20 && !assigned; attempt++) {
      try {
        const result = await MiniMeeting.updateOne(
          {
            _id: meeting._id,
            $or: [{ code: { $exists: false } }, { code: null }, { code: '' }]
          },
          { $set: { code: generateMeetingCode() } }
        );
        assigned = result.modifiedCount === 1 || result.matchedCount === 0;
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
    if (!assigned) throw new Error(`Não foi possível gerar código para o meeting ${meeting._id}`);
    if (assigned) updated++;
  }

  if (updated > 0) console.log(`${updated} código(s) de meeting gerado(s)`);
}

module.exports = migrateMeetingCodes;