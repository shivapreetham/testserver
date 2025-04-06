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
  // Find all users with NIT credentials
  // We'll handle sorting in memory for more complex criteria
  const allUsers = await User.find({
    NITUsername: { $exists: true, $ne: '' },
    NITPassword: { $exists: true, $ne: '' },
  });
  
  console.log(`Found ${allUsers.length} users with NIT credentials for processing`);
  
  if (!allUsers.length) {
    console.log('No users with valid NIT credentials found.');
    return [];
  }
  
  // Custom sorting function:
  // 1. First prioritize users with overallTotalClasses = 0
  // 2. Within each group, sort by createdAt (newest first)
  const users = allUsers.sort((a, b) => {
    // First compare by overallTotalClasses (0 first)
    if ((a.overallTotalClasses || 0) === 0 && (b.overallTotalClasses || 0) > 0) return -1;
    if ((a.overallTotalClasses || 0) > 0 && (b.overallTotalClasses || 0) === 0) return 1;
    
    // If overallTotalClasses is the same for both, sort by createdAt (newest first)
    // Need to handle if createdAt doesn't exist
    const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    
    return bDate - aDate; // Sort in descending order (newest first)
  });
  
  console.log('Users sorted by priority (zero attendance + newest first)');
  
  const results = [];
  
  for (const user of users) {
    try {
      console.log(`Processing user ${user._id} (${user.NITUsername}) at ${new Date().toISOString()}...`);
      console.log(`User details: Total Classes: ${user.overallTotalClasses || 0}, Created: ${user.createdAt || 'unknown'}`);
      
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
      
      // Wait 60 seconds before processing the next user
      console.log(`Waiting 60 seconds before processing next user...`);
      await delay(60000);
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
      console.log(`Error occurred, waiting 45 seconds before continuing...`);
      await delay(45000); // Shorter delay after errors
    }
  }
  
  return results;
}

export default processUsers;