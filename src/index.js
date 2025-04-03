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

// Add this route in index.js
app.get('/userSpecific', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email parameter is required'
      });
    }
    
    // Find user with this email
    const user = await User.findOne({ 
      email: email,
      NITUsername: { $exists: true, $ne: '' },
      NITPassword: { $exists: true, $ne: '' }
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found or missing NIT credentials'
      });
    }
    
    console.log(`Processing specific user ${user._id}...`);
    const attendanceData = await scrapeAttendance(user.NITUsername, user.NITPassword);
    await saveOrUpdateAttendance(user._id, attendanceData);
    const dailyComparison = await compareAndUpdateDailyAttendance(user._id, attendanceData);
    await calculateAndUpdateMetrics(user._id, attendanceData);
    
    res.json({
      success: true,
      message: 'User attendance processed successfully',
      result: {
        userId: user._id,
        status: 'Processed',
        dailyComparison
      }
    });
    
  } catch (error) {
    console.error('Error processing specific user:', error);
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
