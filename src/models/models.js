import mongoose from 'mongoose';

// -----------------------------------------------------
// AnonymousMessage Model
// -----------------------------------------------------
const AnonymousMessageSchema = new mongoose.Schema({
  content: { type: String, required: true },
  createdAt: { type: Date, required: true, default: Date.now },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});

// -----------------------------------------------------
// SubjectMetrics Schema
// -----------------------------------------------------
const SubjectMetricsSchema = new mongoose.Schema({
  subjectCode: { type: String, required: true },
  subjectName: { type: String, required: true },
  subjectProfessor: { type: String, required: true },
  attendedClasses: { type: Number, default: 0 },
  totalClasses: { type: Number, default: 0 },
  attendancePercentage: { type: Number, default: 0 },
  isAbove75: { type: Boolean, default: false },
  classesNeeded: { type: Number, default: 0 },
  classesCanSkip: { type: Number, default: 0 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});

// -----------------------------------------------------
// User Model
// -----------------------------------------------------
const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      match: [/^[A-Za-z0-9]+@nitjsr\.ac\.in$/, 'Please fill a valid email address (ending with @nitjsr.ac.in)'],
    },
    image: { type: String },
    hashedPassword: { type: String },
    // Fields for scraping credentials
    NITUsername: { type: String, required: true },
    NITPassword: { type: String, required: true },
    verifyCode: { type: String},
    verifyCodeExpiry: { type: Date },
    isVerified: { type: Boolean, default: false },
    isAcceptingAnonymousMessages: { type: Boolean, default: true },
    course: { type: String },
    batch: { type: String },
    branch: { type: String },
    loginDays: { type: Number },
    loginStreak: { type: Number },
    avatar: { type: String },
    honorScore: { type: Number, default: 100 },
    lastSeen: { type: Date, default: Date.now },
    activeStatus: { type: Boolean, default: false },
    
    // Relationship fields
    conversationIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' }],
    seenMessageIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
    
    // Attendance metrics fields
    overallAttendedClasses: { type: Number, default: 0 },
    overallTotalClasses: { type: Number, default: 0 },
    overallPercentage: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// -----------------------------------------------------
// Conversation Model
// -----------------------------------------------------
const ConversationSchema = new mongoose.Schema({
  createdAt: { type: Date, default: Date.now },
  lastMessageAt: { type: Date, default: Date.now },
  name: { type: String },
  isGroup: { type: Boolean },
  isAnonymous: { type: Boolean, default: false },
  userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  messagesIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }]
});

// -----------------------------------------------------
// Message Model
// -----------------------------------------------------
const MessageSchema = new mongoose.Schema({
  body: { type: String },
  image: { type: String },
  createdAt: { type: Date, default: Date.now },
  seenIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});

// -----------------------------------------------------
// AttendanceSubject Model (for cumulative attendance)
// -----------------------------------------------------
const AttendanceSubjectSchema = new mongoose.Schema({
  slNo: { type: String, required: true },
  subjectCode: { type: String, required: true },
  subjectName: { type: String, required: true },
  facultyName: { type: String, required: true },
  presentTotal: { type: String, required: true },
  attendancePercentage: { type: String, required: true },
  attendanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance', required: true }
});

// -----------------------------------------------------
// Attendance Model
// -----------------------------------------------------
const AttendanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, default: Date.now }
});

// -----------------------------------------------------
// DailyAttendanceSubject Model
// -----------------------------------------------------
const DailyAttendanceSubjectSchema = new mongoose.Schema({
  subjectCode: { type: String, required: true },
  subjectName: { type: String, required: true },
  facultyName: { type: String, required: true },
  attendedClasses: { type: Number, required: true },
  totalClasses: { type: Number, required: true },
  dailyAttendanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyAttendance', required: true }
});

// -----------------------------------------------------
// DailyAttendance Model
// -----------------------------------------------------
const DailyAttendanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, default: Date.now }
});

// -----------------------------------------------------
// Models Registration - CRITICAL FIX: Use exact collection names matching Prisma
// -----------------------------------------------------
// Notice that we're explicitly specifying the collection names to match Prisma's conventions
const AnonymousMessage = mongoose.models.AnonymousMessage || mongoose.model('AnonymousMessage', AnonymousMessageSchema, 'AnonymousMessage');
const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema, 'Conversation');
const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema, 'Message');
const User = mongoose.models.User || mongoose.model('User', UserSchema, 'User');
const SubjectMetrics = mongoose.models.SubjectMetrics || mongoose.model('SubjectMetrics', SubjectMetricsSchema, 'SubjectMetrics');
const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', AttendanceSchema, 'Attendance');
const AttendanceSubject = mongoose.models.AttendanceSubject || mongoose.model('AttendanceSubject', AttendanceSubjectSchema, 'AttendanceSubject');
const DailyAttendance = mongoose.models.DailyAttendance || mongoose.model('DailyAttendance', DailyAttendanceSchema, 'DailyAttendance');
const DailyAttendanceSubject = mongoose.models.DailyAttendanceSubject || mongoose.model('DailyAttendanceSubject', DailyAttendanceSubjectSchema, 'DailyAttendanceSubject');

export { 
  AnonymousMessage, 
  Conversation, 
  Message, 
  User, 
  SubjectMetrics,
  Attendance, 
  AttendanceSubject,
  DailyAttendance, 
  DailyAttendanceSubject 
};