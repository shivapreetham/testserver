import express from 'express';
import { chromium } from 'playwright';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Import models
import { User, Attendance, DailyAttendance } from './models/models.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());
const MONGODB_URI=process.env.MONGODB_URI
console.log("MONGODB_URI:", MONGODB_URI);

// Connect to MongoDB
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

/**
 * Scrape attendance data using Playwright.
 * This function includes all the debugging logs, screenshots, and cleaning steps as in your original code.
 */
async function scrapeAttendance(username, password) {
  console.log(username + ' ' + password);
  let browser;
  try {
    console.log(`Launching browser with Playwright for ${username}...`);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Navigating to Login page...');
    await page.goto('https://online.nitjsr.ac.in/endsem/Login.aspx', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    // await page.screenshot({ path: `login_page_${username}.png` }); // Debug: Check login page appearance

    console.log('Waiting for login fields...');
    await page.waitForSelector('#txtuser_id', { timeout: 10000 });
    await page.fill('#txtuser_id', username);
    await page.fill('#txtpassword', password);

    console.log('Submitting login form...');
    await Promise.all([
      page.click('#btnsubmit'),
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
    ]);
    // Optionally, capture a screenshot after login:
    // await page.screenshot({ path: `after_login_${username}.png` });

    console.log('Navigating to Attendance page...');
    await page.goto('https://online.nitjsr.ac.in/endsem/StudentAttendance/ClassAttendance.aspx', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForSelector('table.table', { timeout: 30000 });
    // await page.screenshot({ path: `attendance_page_${username}.png` }); // Debug: Check attendance page

    console.log('Scraping attendance data...');
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

    console.log('Attendance data scraped:', attendanceData);

    // Function to filter out rows where subjectName is purely numeric.
    function cleanAttendanceData(data) {
      return data.filter((item) => !/^\d+$/.test(item.subjectName));
    }

    // Function to update serial numbers sequentially.
    function updateSerialNumbers(data) {
      return data.map((item, index) => ({
        ...item,
        slNo: (index + 1).toString(),
      }));
    }

    const cleanedData = cleanAttendanceData(attendanceData);
    const finalData = updateSerialNumbers(cleanedData);

    console.log('Closing browser and returning scraped data...');
    await browser.close();
    return finalData;
  } catch (error) {
    if (browser) await browser.close();
    console.error(`Error scraping attendance for ${username}:`, error);
    throw error;
  }
}

/**
 * Check if cumulative attendance for a user already exists for a given date.
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
 * Save cumulative attendance if not already present for today.
 */
async function saveAttendance(userId, attendanceData) {
  const today = new Date();
  const exists = await attendanceExists(userId, today);
  if (exists) {
    console.log(`Attendance data already exists for user ${userId} for today.`);
    return exists;
  }
  const newAttendance = new Attendance({
    userId: userId.toString(),
    date: today,
    subjects: attendanceData,
  });
  const saved = await newAttendance.save();
  console.log(`Saved cumulative attendance for user ${userId}.`);
  return saved;
}

/**
 * Compare today's cumulative attendance with yesterday's data and save the daily differences.
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
    const yesterdayAttendance = await Attendance.findOne({
      userId: userId.toString(),
      date: {
        $gte: yesterdayStart,
        $lt: todayStart,
      },
    });

    if (!yesterdayAttendance) {
      console.log(`No attendance data for yesterday for user ${userId}.`);
      return { message: 'No attendance data for yesterday' };
    }

    const classesHeldToday = [];
    const missedClasses = [];

    todayAttendance.forEach((todaySubject) => {
      const yesterdaySubject = yesterdayAttendance.subjects.find(
        (subject) => subject.subjectCode === todaySubject.subjectCode
      );
      if (yesterdaySubject) {
        const [todayAttended, todayTotal] = todaySubject.presentTotal.split('/').map(Number);
        const [yesterdayAttended, yesterdayTotal] = yesterdaySubject.presentTotal.split('/').map(Number);

        const classesHeldTodayCount = todayTotal - yesterdayTotal;
        const attendedTodayCount = todayAttended - yesterdayAttended;

        if (classesHeldTodayCount > 0) {
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
    });

    const dailyRecord = new DailyAttendance({
      userId: userId.toString(),
      date: todayStart,
      subjects: classesHeldToday,
      // Optionally, include missedClasses if your schema supports it.
    });

    await dailyRecord.save();
    console.log(`Saved daily attendance differences for user ${userId}.`);
    return { classesHeldToday, missedClasses };
  } catch (error) {
    console.error(`Error comparing attendance for user ${userId}:`, error);
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

    if (!user.subjects || user.subjects.length === 0) {
      user.subjects = attendanceData.map((subject) => ({
        subjectCode: subject.subjectCode,
        subjectName: subject.subjectName,
        subjectProfessor: subject.facultyName,
        attendedClasses: 0,
        totalClasses: 0,
        attendancePercentage: 0,
        isAbove75: false,
        classesNeeded: 0,
        classesCanSkip: 0,
      }));
    }

    let overallAttendedClasses = 0;
    let overallTotalClasses = 0;

    attendanceData.forEach((subject) => {
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

      const existingSubject = user.subjects.find((s) => s.subjectCode === subject.subjectCode);
      if (existingSubject) {
        existingSubject.attendedClasses = attended;
        existingSubject.totalClasses = total;
        existingSubject.attendancePercentage = attendancePercentage;
        existingSubject.isAbove75 = isAbove75;
        existingSubject.classesNeeded = classesNeeded;
        existingSubject.classesCanSkip = classesCanSkip;
      }
    });

    user.overallAttendedClasses = overallAttendedClasses;
    user.overallTotalClasses = overallTotalClasses;
    user.overallPercentage =
      overallTotalClasses > 0 ? (overallAttendedClasses / overallTotalClasses) * 100 : 0;

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
 * saves cumulative data (if not already saved for today), computes daily differences,
 * and updates attendance metrics.
 */
app.get('/', async (req, res) => {
  try {
    const users = await User.find({
      NITUsername: { $exists: true, $ne: '' },
      NITPassword: { $exists: true, $ne: '' },
    });

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

    // In production, you might uncomment the block below to delete attendance records older than one week.
    /*
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    await Attendance.deleteMany({ date: { $lt: oneWeekAgo } });
    */

    res.json({
      success: true,
      message: 'Attendance processing completed.',
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
