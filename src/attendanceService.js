// attendanceService.js
import { 
  Attendance, 
  AttendanceSubject, 
  DailyAttendance, 
  DailyAttendanceSubject, 
  SubjectMetrics, 
  User 
} from './models/models.js';

export async function attendanceExists(userId, date) {
  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);
  return await Attendance.findOne({
    userId: userId.toString(),
    date: { $gte: startOfDay, $lte: endOfDay },
  });
}

export async function saveOrUpdateAttendance(userId, attendanceData) {
  const today = new Date();
  const exists = await attendanceExists(userId, today);
  
  if (exists) {
    console.log(`Updating attendance for user ${userId} for today.`);
    await AttendanceSubject.deleteMany({ attendanceId: exists._id });
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

export async function compareAndUpdateDailyAttendance(userId, todayAttendance) {
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
    console.log(`Daily attendance differences updated for user ${userId}.`);
    return { classesHeldToday, missedClasses };
  } catch (error) {
    console.error(`Error comparing daily attendance for user ${userId}:`, error);
    throw error;
  }
}

export async function calculateAndUpdateMetrics(userId, attendanceData) {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    
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
    console.log(`Updated metrics for user ${userId}.`);
    return user;
  } catch (error) {
    console.error(`Error calculating metrics for user ${userId}:`, error);
    throw error;
  }
}
