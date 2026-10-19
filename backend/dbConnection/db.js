import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const isProduction = process.env.NODE_ENV === "production";
    const mongoUri = isProduction
      ? process.env.DB_URI || process.env.MONGODB_URI
      : process.env.LOCAL_DB_URI ||
        process.env.DEV_DB_URI ||
        process.env.DB_URI ||
        process.env.MONGODB_URI;

    if (!mongoUri) {
      throw new Error(
        isProduction
          ? "Missing production DB connection string. Set DB_URI or MONGODB_URI."
          : "Missing DB connection string. Add LOCAL_DB_URI, DEV_DB_URI, DB_URI, or MONGODB_URI to your .env file.",
      );
    }

    if (isProduction) {
      const databaseHost = new URL(mongoUri).hostname;
      if (/^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[?::1\]?)$/i.test(databaseHost)) {
        throw new Error("Production database configuration must use a remote database host.");
      }
    }

    await mongoose.connect(mongoUri);
    console.log("MongoDB connected successfully!");

    const syncRegistrationNumberIndex = async () => {
      try {
        const admissions = mongoose.connection.db.collection("admissions");

        // Remove bad stored values before syncing the index so blank/null values do not collide.
        await admissions.updateMany(
          {
            registrationNo: { $in: [null, "", "null", "undefined"] },
          },
          {
            $unset: { registrationNo: 1 },
          },
        );

        const indexes = await admissions.indexes();
        const registrationIndex = indexes.find(
          (index) => index.name === "registrationNo_1",
        );

        if (
          registrationIndex &&
          (!registrationIndex.unique || !registrationIndex.sparse)
        ) {
          await admissions.dropIndex("registrationNo_1");
          await admissions.createIndex(
            { registrationNo: 1 },
            { name: "registrationNo_1", unique: true, sparse: true },
          );
          console.log(
            "Recreated admissions registrationNo index as unique+sparse.",
          );
        }
      } catch (indexError) {
        console.warn(
          "Could not sync admissions registrationNo index:",
          indexError.message,
        );
      }
    };

    // Remove legacy unique indexes so same student can enroll in the same course multiple times.
    const dropLegacyUniqueIndex = async (collectionName, indexName, label) => {
      try {
        await mongoose.connection.db.collection(collectionName).dropIndex(indexName);
        console.log(`Dropped legacy unique index (${label}): ${indexName}`);
      } catch (indexError) {
        if (indexError.codeName !== "IndexNotFound") {
          console.warn(
            `Could not drop legacy ${label} index:`,
            indexError.message,
          );
        }
      }
    };

    await dropLegacyUniqueIndex(
      "enrollments",
      "student_1_course_1",
      "enrollment",
    );
    await dropLegacyUniqueIndex(
      "feestructures",
      "student_1_course_1",
      "fee structure",
    );
    await syncRegistrationNumberIndex();
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
};

export default connectDB;
