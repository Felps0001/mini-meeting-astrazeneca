const crypto = require('crypto');

function generateMeetingCode() {
  const number = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  return `AZ-${number}`;
}

module.exports = { generateMeetingCode };