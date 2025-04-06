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
  
  console.log(`Found ${users.length} users with NIT credentials for processing`);
  
  if (!users.length) {
    console.log('No users with valid NIT credentials found.');
    return [];
  }
  
  const results = [];
  
  for (const user of users) {
    try {
      console.log(`Processing user ${user._id} (${user.NITUsername}) at ${new Date().toISOString()}...`);
      
      const attendanceData = await scrapeAttendance(user.NITUsername, user.NITPassword);
      console.log(`Scraped attendance data for user ${user._id}, found ${attendanceData.length} subjects`);
      
      const savedAttendance = await saveOrUpdateAttendance(user._id, attendanceData);
      console.log(`Saved/updated attendance for user ${user._id}`);
      
      const dailyComparison = await compareAndUpdateDailyAttendance(user._id, attendanceData);
      console.log(`Processed daily comparison for user ${user._id}`);
      
      const updatedMetrics = await calculateAndUpdateMetrics(user._id, attendanceData);
      console.log(`Updated metrics for user ${user._id}, overall attendance: ${updatedMetrics.overallPercentage.toFixed(2)}%`);
      
      results.push({
        userId: user._id,
        username: user.NITUsername,
        status: 'Processed',
        timestamp: new Date().toISOString(),
        overallAttendance: updatedMetrics.overallPercentage,
        dailyComparison,
      });
      
      // Wait 30 seconds before processing the next user
      console.log(`Waiting 30 seconds before processing next user...`);
      await delay(30000);
    } catch (error) {
      console.error(`Error processing user ${user._id} (${user.NITUsername}):`, error);
      results.push({
        userId: user._id,
        username: user.NITUsername,
        status: 'Error',
        timestamp: new Date().toISOString(),
        error: error.message,
      });
      
      // Still wait before moving to next user even if there was an error
      console.log(`Error occurred, waiting 15 seconds before continuing...`);
      await delay(15000); // Shorter delay after errors
    }
  }
  
  return results;
}

export default processUsers;