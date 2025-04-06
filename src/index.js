import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import processUsers from './userProcessor.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

const MONGODB_URI = process.env.MONGODB_URI;
console.log("MONGODB_URI:", MONGODB_URI);

// Connect to MongoDB
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
    startContinuousScraping();
  })
  .catch((err) => console.error('MongoDB connection error:', err));

// Flag to track if a scraping process is currently running
let isScrapingInProgress = false;
let lastRunTime = null;
let lastRunResults = null;

// Function to run the scraping process continuously
async function startContinuousScraping() {
  console.log('Starting continuous scraping process. This will run indefinitely.');
  
  while (true) { // Infinite loop
    if (!isScrapingInProgress) {
      isScrapingInProgress = true;
      console.log(`Starting user processing cycle at ${new Date().toISOString()}`);
      
      try {
        const results = await processUsers();
        console.log(`Completed processing cycle at ${new Date().toISOString()}`);
        console.log(`Processed ${results.length} users`);
        console.log(`Success: ${results.filter(r => r.status === 'Processed').length}`);
        console.log(`Errors: ${results.filter(r => r.status === 'Error').length}`);
        
        lastRunTime = new Date();
        lastRunResults = results;
      } catch (error) {
        console.error('Error in processing cycle:', error);
      } finally {
        isScrapingInProgress = false;
        console.log('Immediately starting next cycle...');
      }
    }
    
    // Small delay to prevent CPU hogging in the while loop
    // This doesn't affect the user processing, just the main loop
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Status endpoint to check when the last scrape happened
app.get('/status', (req, res) => {
  res.json({
    status: isScrapingInProgress ? 'in_progress' : 'waiting_to_start_next_cycle',
    lastRun: lastRunTime ? lastRunTime.toISOString() : 'Never',
    lastRunResults: lastRunResults
  });
});

// Manual trigger endpoint with authentication
app.post('/trigger-scrape', async (req, res) => {
  const secretKey = req.headers['x-api-key'];
  
  // Basic authentication - replace 'your-secret-key' with an actual secret from env vars
  if (secretKey !== process.env.API_SECRET) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  if (isScrapingInProgress) {
    return res.json({
      success: false,
      message: 'Scraping process already running'
    });
  }
  
  res.json({ 
    success: true, 
    message: 'Scraping process triggered manually',
    note: 'Process running in background, check /status for updates'
  });
  
  // We don't need to manually trigger the process since it's continuously running
  // This endpoint mainly serves to check if manual triggering would be possible
});

// Original root endpoint
app.get('/', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Attendance server is running.',
      info: 'Continuous scraping is active. Check /status for details.',
      scrapingStatus: isScrapingInProgress ? 'Processing users' : 'Between cycles'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error.',
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});