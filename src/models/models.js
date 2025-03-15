import mongoose from 'mongoose';

// -----------------------------------------------------
// AnonymousMessage Model
// -----------------------------------------------------
const AnonymousMessageSchema = new mongoose.Schema({
  content: { type: String, required: true },
  createdAt: { type: Date, required: true, default: Date.now },
});

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
  messagesIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
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
// Subject Metrics Schema (for attendance metrics)
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
    verifyCode: { type: String, required: true },
    verifyCodeExpiry: { type: Date, required: true },
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
    anonymousMessages: [AnonymousMessageSchema],
    conversationIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' }],
    conversations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' }],
    seenMessageIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
    seenMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
    messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
    // Attendance metrics fields
    subjects: [SubjectMetricsSchema],
    overallAttendedClasses: { type: Number, default: 0 },
    overallTotalClasses: { type: Number, default: 0 },
    overallPercentage: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// -----------------------------------------------------
// Attendance Models (for scraping and saving attendance)
// -----------------------------------------------------
// AttendanceSubject Model (cumulative attendance)
const AttendanceSubjectSchema = new mongoose.Schema({
  slNo: { type: String, required: true },
  subjectCode: { type: String, required: true },
  subjectName: { type: String, required: true },
  facultyName: { type: String, required: true },
  presentTotal: { type: String, required: true },
  attendancePercentage: { type: String, required: true },
});

// Attendance Model
const AttendanceSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  date: { type: Date, default: Date.now },
  subjects: [AttendanceSubjectSchema],
});

// DailyAttendanceSubject Model (for computed daily differences)
const DailyAttendanceSubjectSchema = new mongoose.Schema({
  subjectCode: { type: String, required: true },
  subjectName: { type: String, required: true },
  facultyName: { type: String, required: true },
  attendedClasses: { type: Number, required: true },
  totalClasses: { type: Number, required: true },
});

// DailyAttendance Model
const DailyAttendanceSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  date: { type: Date, default: Date.now },
  subjects: [DailyAttendanceSubjectSchema],
});

// -----------------------------------------------------
// Models Export
// -----------------------------------------------------
const AnonymousMessage = mongoose.models.AnonymousMessage || mongoose.model('AnonymousMessage', AnonymousMessageSchema);
const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);
const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);
const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', AttendanceSchema);
const DailyAttendance = mongoose.models.DailyAttendance || mongoose.model('DailyAttendance', DailyAttendanceSchema);

export { AnonymousMessage, Conversation, Message, User, Attendance, DailyAttendance };
