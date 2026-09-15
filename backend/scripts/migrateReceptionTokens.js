const { v4: uuidv4 } = require('uuid');
const MiniMeeting = require('../models/MiniMeeting');

async function migrateReceptionTokens() {
  await MiniMeeting.init();
  const meetings = await MiniMeeting.find({
    $or: [
      { receptionToken: { $exists: false } },
      { receptionToken: null },
      { receptionToken: '' }
    ]
  }).select('_id');

  let updated = 0;
  for (const meeting of meetings) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const result = await MiniMeeting.collection.updateOne(
          {
            _id: meeting._id,
            $or: [
              { receptionToken: { $exists: false } },
              { receptionToken: null },
              { receptionToken: '' }
            ]
          },
          { $set: { receptionToken: uuidv4() } }
        );
        if (result.modifiedCount === 1) updated++;
        break;
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
  }

  if (updated > 0) console.log(`${updated} token(s) de recepção gerado(s)`);
}

module.exports = migrateReceptionTokens;