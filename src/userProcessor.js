// userProcessor.js
import { scrapeAttendance } from './Scraper.js';
import { 
  saveOrUpdateAttendance, 
  compareAndUpdateDailyAttendance, 
  calculateAndUpdateMetrics 
} from './attendanceService.js';
import { User } from './models/models.js';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processUsers() {
  // Find all users with NIT credentials and sort them by overallTotalClasses (ascending)
  const users = await User.find({
    NITUsername: { $exists: true, $ne: '' },
    NITPassword: { $exists: true, $ne: '' },
  }).sort({ overallTotalClasses: 1 });
  
  console.log("Users with NIT credentials (sorted):", users);
  
  if (!users.length) {
    throw new Error('No users with valid NIT credentials found.');
  }
  const results = [];
  for (const user of users) {
    try {
      console.log(`Processing user ${user._id}...`);
      const attendanceData = await scrapeAttendance(user.NITUsername, user.NITPassword);
      await saveOrUpdateAttendance(user._id, attendanceData);
      const dailyComparison = await compareAndUpdateDailyAttendance(user._id, attendanceData);
      await calculateAndUpdateMetrics(user._id, attendanceData);
      results.push({
        userId: user._id,
        status: 'Processed',
        dailyComparison,
      });
      // Wait 30 seconds before processing the next user
      console.log(`Waiting 30 seconds before processing next user...`);
      await delay(30000);
    } catch (error) {
      console.error(`Error processing user ${user._id}:`, error);
      results.push({
        userId: user._id,
        status: 'Error',
        error: error.message,
      });
    }
  }
  return results;
}

export default processUsers;
