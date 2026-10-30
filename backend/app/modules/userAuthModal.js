import mongoose from "mongoose";

const permissionActionSchema = new mongoose.Schema(
  {
    view: { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    update: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    import: { type: Boolean, default: false },
    export: { type: Boolean, default: false },
    print: { type: Boolean, default: false },
    approve: { type: Boolean, default: false },
  },
  { _id: false },
);

const permissionSchema = new mongoose.Schema(
  {
    module: {
      type: String,
      required: true,
      trim: true,
    },
    actions: {
      type: permissionActionSchema,
      default: () => ({}),
    },
  },
  { _id: false },
);

const authSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    role: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    legacyRole: {
      type: String,
      trim: true,
      default: "",
    },
    accountType: {
      type: String,
      enum: ["admin", "employee", "student"],
      default: "admin",
      index: true,
    },
    student: {
      type: String,
      ref: "Admission",
      default: null,
      index: true,
    },
    studentPortal: {
      academyEmail: { type: String, default: "" },
      initialPassword: { type: String, default: "" },
      courseIds: [{ type: String, ref: "Course" }],
      batchIds: [{ type: String, ref: "Batch" }],
      createdBy: { type: String, ref: "User" },
    },
    attendanceBatchIds: {
      type: [{ type: String, ref: "Batch" }],
      default: [],
    },
    isSuperAdmin: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    password: {
      type: String,
      required: true,
    },
    profile: {
      type: String,
      default:
        "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQIf4R5qPKHPNMyAqV-FjS_OTBB8pfUV29Phg&s",
    },
    details: {
      coverPhoto: { type: String },
      education: { type: String },
      city: { type: String },
      age: { type: Number },
      gender: { type: String },
      job: { type: String },
      status: { type: String },
      phone: { type: String },
      address: { type: String },
      socialLinks: {
        facebook: { type: String },
        twitter: { type: String },
        linkedin: { type: String },
        instagram: { type: String },
      },
    },
    testPaperHeader: {
      logo: { type: String, default: "" },
      logoText: { type: String, default: "" },
      academyName: { type: String, default: "" },
      address: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      website: { type: String, default: "" },
      note: { type: String, default: "" },
    },
    permissions: {
      type: [permissionSchema],
      default: [],
    },
  },
  { timestamps: true }
);

authSchema.pre("save", function syncLegacyRole(next) {
  if (typeof this.role === "string") {
    this.legacyRole = this.role;
  }
  next();
});

const UserAuth = mongoose.model("User", authSchema);
export default UserAuth;
