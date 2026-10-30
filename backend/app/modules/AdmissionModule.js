// models/Admission.js
import mongoose from "mongoose";
import { normalizeDateOnly } from "../utils/dateOnly.js";

const AdmissionSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },

    registrationNo: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    registrationDate: {
      type: Date,
      required: true,
      set: normalizeDateOnly,
    },

    studentName: {
      type: String,
      required: true,
      trim: true,
    },

    gender: {
      type: String,
      enum: ["Male", "Female"],
      required: true,
    },

    dateOfBirth: {
      type: Date,
      required: true,
      set: normalizeDateOnly,
    },

    caste: {
      type: String,
      trim: true,
    },

    religion: {
      type: String,
      enum: ["Muslim", "Non-Muslim"],
      required: true,
    },

    cnicOrBForm: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    disability: {
      type: Boolean, // Yes = true, No = false
      default: false,
    },

    previousSchoolCollege: {
      type: String,
      trim: true,
    },

    lastClassAttended: {
      type: String,
      trim: true,
    },

    fatherName: {
      type: String,
      required: true,
      trim: true,
    },

    fatherCnic: {
      type: String,
      required: true,
      trim: true,
    },

    fatherOccupation: {
      type: String,
      trim: true,
    },

    fatherContact: {
      type: String,
      trim: true,
    },

    guardianName: {
      type: String,
      trim: true,
    },

    guardianContact: {
      type: String,
      trim: true,
    },

    relationshipWithStudent: {
      type: String,
      trim: true,
    },

    annualIncome: {
      type: Number,
      min: 0,
    },

    mobileNumber: {
      type: String,
      required: true,
      trim: true,
    },

    whatsappNumber: {
      type: String,
      trim: true,
    },

    emailAddress: {
      type: String,
      lowercase: true,
      trim: true,
    },

    permanentAddress: {
      type: String,
      required: true,
      trim: true,
    },

    currentAddress: {
      type: String,
      trim: true,
    },

    // Permanent Address Location Fields
    province: {
      type: String,
      trim: true,
    },

    city: {
      type: String,
      trim: true,
    },

    unionCouncil: {
      type: String,
      trim: true,
    },

    tehsil: {
      type: String,
      trim: true,
    },

    district: {
      type: String,
      trim: true,
    },

    // Present Address Location Fields
    presentProvince: {
      type: String,
      trim: true,
    },

    presentDistrict: {
      type: String,
      trim: true,
    },

    presentCity: {
      type: String,
      trim: true,
    },

    presentUnionCouncil: {
      type: String,
      trim: true,
    },

    // Domicile Information
    domicileDistrict: {
      type: String,
      trim: true,
    },

    emergencyContactNumber: {
      type: String,
      required: true,
      trim: true,
    },

    reference: {
      type: String,
      enum: [
        "Friend",
        "Facebook",
        "Family",
        "School",
        "Walk-in",
        "Online",
        "Other",
      ],
    },

    course: {
      type: String,
      ref: "Course",
    },

    // Multiple course enrollments
    enrolledCourses: [
      {
        type: String,
        ref: "Course",
      },
    ],

    photo: {
      type: String, // image URL / filename
      default: "",
    },

    profilePicture: {
      type: String, // Base64 encoded image
      default: "",
    },

    faceAttendance: {
      enabled: {
        type: Boolean,
        default: false,
      },
      imageData: {
        type: String, // Base64 enrollment capture used for admin review
        default: "",
        select: false,
      },
      faceHash: {
        type: String,
        default: "",
        trim: true,
        select: false,
      },
      faceHashV2: {
        type: String,
        default: "",
        trim: true,
        select: false,
      },
      descriptorsEncrypted: {
        type: String,
        default: "",
        select: false,
      },
      modelVersion: {
        type: String,
        default: "",
        trim: true,
      },
      samplesCount: {
        type: Number,
        default: 0,
        min: 0,
      },
      updatedBy: {
        type: String,
        ref: "User",
      },
      updatedAt: {
        type: Date,
      },
    },

    // Active status
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Delete the model if it exists to avoid OverwriteModelError
if (mongoose.models.Admission) {
  delete mongoose.models.Admission;
}

export default mongoose.model("Admission", AdmissionSchema);
