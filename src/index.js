import express from 'express';
import { chromium } from 'playwright';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Import updated models
import { 
  User, 
  Attendance, 
  AttendanceSubject,
  DailyAttendance, 
  DailyAttendanceSubject,
  SubjectMetrics 
} from './models/models.js';

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

/**
 * Scrape attendance data using Playwright.
 */
async function scrapeAttendance(username, password) {
  console.log(`Scraping for ${username}`);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://online.nitjsr.ac.in/endsem/Login.aspx', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await page.waitForSelector('#txtuser_id', { timeout: 10000 });
    await page.fill('#txtuser_id', username);
    await page.fill('#txtpassword', password);

    await Promise.all([
      page.click('#btnsubmit'),
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
    ]);

    await page.goto('https://online.nitjsr.ac.in/endsem/StudentAttendance/ClassAttendance.aspx', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForSelector('table.table', { timeout: 30000 });

    const attendanceData = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table.table tr:not(:first-child)'));
      let currentIndex = 1;
      const cleanText = (text) => text?.trim().split('\n')[0].trim() || '';
      return rows
        .map((row) => {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length < 6) return null;
          return {
            slNo: (currentIndex++).toString(),
            subjectCode: cleanText(cells[1]?.innerText),
            subjectName: cleanText(cells[2]?.innerText),
            facultyName: cleanText(cells[3]?.innerText),
            presentTotal: cleanText(cells[4]?.innerText),
            attendancePercentage: cleanText(cells[5]?.innerText),
          };
        })
        .filter(Boolean);
    });

    // Clean out numeric-only subject names and update serial numbers.
    const cleanAttendanceData = (data) =>
      data.filter((item) => !/^\d+$/.test(item.subjectName));
    const updateSerialNumbers = (data) =>
      data.map((item, index) => ({ ...item, slNo: (index + 1).toString() }));

    const finalData = updateSerialNumbers(cleanAttendanceData(attendanceData));
    await browser.close();
    return finalData;
  } catch (error) {
    if (browser) await browser.close();
    console.error(`Error scraping for ${username}:`, error);
    throw error;
  }
}

/**
 * Find an existing Attendance record for a given user and date.
 */
async function attendanceExists(userId, date) {
  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);
  return await Attendance.findOne({
    userId: userId.toString(),
    date: { $gte: startOfDay, $lte: endOfDay },
  });
}

/**
 * Save or update cumulative attendance for today.
 * If a record exists, update its AttendanceSubject records.
 */
async function saveAttendance(userId, attendanceData) {
  const today = new Date();
  const exists = await attendanceExists(userId, today);
  
  if (exists) {
    console.log(`Updating attendance for user ${userId} for today.`);
    // Remove existing AttendanceSubject documents
    await AttendanceSubject.deleteMany({ attendanceId: exists._id });
    // Create new AttendanceSubject documents for each subject
    const subjectPromises = attendanceData.map(async (subjectData) => {
      const newSubject = new AttendanceSubject({
        ...subjectData,
        attendanceId: exists._id,
      });
      return await newSubject.save();
    });
    await Promise.all(subjectPromises);
    return exists;
  } else {
    // Create a new Attendance record
    const newAttendance = new Attendance({
      userId: userId.toString(),
      date: today,
    });
    const savedAttendance = await newAttendance.save();
    const subjectPromises = attendanceData.map(async (subjectData) => {
      const newSubject = new AttendanceSubject({
        ...subjectData,
        attendanceId: savedAttendance._id,
      });
      return await newSubject.save();
    });
    await Promise.all(subjectPromises);
    console.log(`Saved new attendance for user ${userId}.`);
    return savedAttendance;
  }
}

/**
 * Compare today's cumulative attendance with yesterday's,
 * then update or create a DailyAttendance record accordingly.
 */
async function compareAndSaveDailyAttendance(userId, todayAttendance) {
  const today = new Date();
  const todayStart = new Date(today);
  todayStart.setUTCHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStart = new Date(yesterday);
  yesterdayStart.setUTCHours(0, 0, 0, 0);

  try {
    const yesterdayAttendanceRecord = await Attendance.findOne({
      userId: userId.toString(),
      date: { $gte: yesterdayStart, $lt: todayStart },
    });

    if (!yesterdayAttendanceRecord) {
      console.log(`No yesterday attendance for user ${userId}.`);
      return { message: 'No attendance data for yesterday' };
    }
    
    const yesterdaySubjects = await AttendanceSubject.find({
      attendanceId: yesterdayAttendanceRecord._id,
    });

    // Check if today's DailyAttendance exists; if so, update it.
    let dailyRecord = await DailyAttendance.findOne({
      userId: userId.toString(),
      date: { $gte: todayStart, $lte: today },
    });
    if (!dailyRecord) {
      dailyRecord = new DailyAttendance({
        userId: userId.toString(),
        date: todayStart,
      });
      dailyRecord = await dailyRecord.save();
    } else {
      // Remove old daily attendance subject records
      await DailyAttendanceSubject.deleteMany({ dailyAttendanceId: dailyRecord._id });
    }

    const classesHeldToday = [];
    const missedClasses = [];

    for (const todaySubject of todayAttendance) {
      const yesterdaySubject = yesterdaySubjects.find(
        (subject) => subject.subjectCode === todaySubject.subjectCode
      );
      if (yesterdaySubject) {
        const [todayAttended, todayTotal] = todaySubject.presentTotal.split('/').map(Number);
        const [yesterdayAttended, yesterdayTotal] = yesterdaySubject.presentTotal.split('/').map(Number);
        const classesHeldTodayCount = todayTotal - yesterdayTotal;
        const attendedTodayCount = todayAttended - yesterdayAttended;

        if (classesHeldTodayCount > 0) {
          const dailySubject = new DailyAttendanceSubject({
            subjectCode: todaySubject.subjectCode,
            subjectName: todaySubject.subjectName,
            facultyName: todaySubject.facultyName,
            totalClasses: classesHeldTodayCount,
            attendedClasses: attendedTodayCount,
            dailyAttendanceId: dailyRecord._id,
          });
          await dailySubject.save();
          classesHeldToday.push({
            subjectCode: todaySubject.subjectCode,
            subjectName: todaySubject.subjectName,
            facultyName: todaySubject.facultyName,
            totalClasses: classesHeldTodayCount,
            attendedClasses: attendedTodayCount,
          });
          if (attendedTodayCount === 0) {
            missedClasses.push({
              subjectCode: todaySubject.subjectCode,
              subjectName: todaySubject.subjectName,
              totalClassesHeldToday: classesHeldTodayCount,
            });
          }
        }
      }
    }

    console.log(`Daily attendance differences saved for user ${userId}.`);
    return { classesHeldToday, missedClasses };
  } catch (error) {
    console.error(`Error comparing daily attendance for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Calculate and update attendance metrics for a user based on cumulative attendance.
 */
async function calculateAttendanceMetrics(userId, attendanceData) {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Fetch existing subject metrics for this user
    let subjectMetrics = await SubjectMetrics.find({ userId: user._id });
    let overallAttendedClasses = 0;
    let overallTotalClasses = 0;

    for (const subject of attendanceData) {
      const [attended, total] = subject.presentTotal.split('/').map(Number);
      const attendancePercentage = total > 0 ? (attended / total) * 100 : 0;
      const isAbove75 = attendancePercentage >= 75;
      let classesNeeded = 0;
      let classesCanSkip = 0;
      if (!isAbove75) {
        classesNeeded = Math.ceil((0.75 * total - attended) / 0.25);
      } else {
        classesCanSkip = Math.floor((attended - 0.75 * total) / 0.75);
      }

      overallAttendedClasses += attended;
      overallTotalClasses += total;

      let existingSubject = subjectMetrics.find(s => s.subjectCode === subject.subjectCode);
      if (existingSubject) {
        existingSubject.attendedClasses = attended;
        existingSubject.totalClasses = total;
        existingSubject.attendancePercentage = attendancePercentage;
        existingSubject.isAbove75 = isAbove75;
        existingSubject.classesNeeded = classesNeeded;
        existingSubject.classesCanSkip = classesCanSkip;
        await existingSubject.save();
      } else {
        const newSubjectMetrics = new SubjectMetrics({
          userId: user._id,
          subjectCode: subject.subjectCode,
          subjectName: subject.subjectName,
          subjectProfessor: subject.facultyName,
          attendedClasses: attended,
          totalClasses: total,
          attendancePercentage: attendancePercentage,
          isAbove75: isAbove75,
          classesNeeded: classesNeeded,
          classesCanSkip: classesCanSkip,
        });
        await newSubjectMetrics.save();
        subjectMetrics.push(newSubjectMetrics);
      }
    }

    user.overallAttendedClasses = overallAttendedClasses;
    user.overallTotalClasses = overallTotalClasses;
    user.overallPercentage = overallTotalClasses > 0 ? (overallAttendedClasses / overallTotalClasses) * 100 : 0;
    await user.save();
    console.log(`Updated attendance metrics for user ${userId}.`);
    return user;
  } catch (error) {
    console.error(`Error calculating metrics for user ${userId}:`, error);
    throw error;
  }
}

/**
 * GET route to trigger the automated attendance processing.
 * This route fetches all users with valid NIT credentials, scrapes their attendance,
 * saves or updates cumulative attendance for today, computes daily differences,
 * and updates attendance metrics.
 */
app.get('/', async (req, res) => {
  try {
    const users = await User.find({
      NITUsername: { $exists: true, $ne: '' },
      NITPassword: { $exists: true, $ne: '' },
    });
    console.log("Users with NIT credentials:", users);
    
    if (!users.length) {
      return res.status(404).json({ message: 'No users with valid NIT credentials found.' });
    }

    const results = [];
    for (const user of users) {
      try {
        const attendanceData = await scrapeAttendance(user.NITUsername, user.NITPassword);
        await saveAttendance(user._id, attendanceData);
        const dailyComparison = await compareAndSaveDailyAttendance(user._id, attendanceData);
        await calculateAttendanceMetrics(user._id, attendanceData);

        results.push({
          userId: user._id,
          status: 'Processed',
          dailyComparison,
        });
      } catch (userError) {
        console.error(`Error processing user ${user._id}:`, userError);
        results.push({
          userId: user._id,
          status: 'Error',
          error: userError.message,
        });
      }
    }

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
