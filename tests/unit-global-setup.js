// Run unit tests in a zone with daylight-saving transitions so calendar-week
// logic is tested against 167/169-hour weeks.
module.exports = async () => {
  process.env.TZ = 'America/Los_Angeles';
};
