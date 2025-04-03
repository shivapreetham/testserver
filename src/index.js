// index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import processUsers from './userProcessor.js';

import { scrapeAttendance } from './Scraper.js';
import { 
  saveOrUpdateAttendance, 
  compareAndUpdateDailyAttendance, 
  calculateAndUpdateMetrics 
} from './attendanceService.js';
import { User } from './models/models.js';

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
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));


app.get('/userSpecific', async (req, res) => {
  try {
    // Find all users with uninitialized attendance data.
    const users = await User.find({
      NITUsername: { $exists: true, $ne: '' },
      NITPassword: { $exists: true, $ne: '' },
      overallAttendedClasses: 0,
      overallTotalClasses: 0,
      overallPercentage: 0
    });

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: 'No users found for attendance processing'
      });
    }

    // Process each user.
    const results = [];
    for (const user of users) {
      console.log(`Processing specific user ${user._id}...`);
      const attendanceData = await scrapeAttendance(user.NITUsername, user.NITPassword);
      await saveOrUpdateAttendance(user._id, attendanceData);
      const dailyComparison = await compareAndUpdateDailyAttendance(user._id, attendanceData);
      await calculateAndUpdateMetrics(user._id, attendanceData);
      results.push({
        userId: user._id,
        status: 'Processed',
        dailyComparison
      });
    }

    res.json({
      success: true,
      message: 'User attendance processed successfully',
      result: results
    });
  } catch (error) {
    console.error('Error processing user attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process user attendance data',
      error: error.message
    });
  }
});


app.get('/', async (req, res) => {
  try {
    const results = await processUsers();
    res.json({
      success: true,
      message: 'Attendance processed successfully.',
      results,
    });
  } catch (error) {
    console.error('Error in attendance processing:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process attendance data.',
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
