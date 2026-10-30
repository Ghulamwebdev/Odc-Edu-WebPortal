import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

export const FACE_DESCRIPTOR_SIZE = 128;
export const FACE_MODEL_VERSION = "face-api-128-v1";

const getEncryptionKey = () => {
  const encodedKey = process.env.FACE_DESCRIPTOR_ENCRYPTION_KEY;
  const key = encodedKey ? Buffer.from(encodedKey, "base64") : Buffer.alloc(0);

  if (!encodedKey || key.length !== 32) {
    const error = new Error(
      "Face attendance is unavailable. Configure FACE_DESCRIPTOR_ENCRYPTION_KEY as a base64-encoded 32-byte key.",
    );
    error.code = "FACE_ENCRYPTION_KEY_MISSING";
    throw error;
  }

  return key;
};

export const assertFaceEncryptionConfigured = () => {
  getEncryptionKey();
};

export const normalizeFaceDescriptors = (descriptors) => {
  if (
    !Array.isArray(descriptors) ||
    descriptors.length < 1 ||
    descriptors.length > 5
  ) {
    return null;
  }

  const normalized = descriptors.map((descriptor) => {
    if (
      !Array.isArray(descriptor) ||
      descriptor.length !== FACE_DESCRIPTOR_SIZE ||
      !descriptor.every(
        (value) => Number.isFinite(value) && Math.abs(value) <= 2,
      )
    ) {
      return null;
    }

    return descriptor.map((value) => Number(value));
  });

  return normalized.every(Boolean) ? normalized : null;
};

export const encryptFaceDescriptors = (descriptors) => {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(descriptors), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
};

export const decryptFaceDescriptors = (encryptedValue) => {
  const key = getEncryptionKey();
  const [version, ivValue, tagValue, dataValue] = String(
    encryptedValue || "",
  ).split(".");

  if (version !== "v1" || !ivValue || !tagValue || !dataValue) {
    throw new Error("Stored face descriptor has an unsupported format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivValue, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataValue, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const descriptors = normalizeFaceDescriptors(JSON.parse(decrypted));

  if (!descriptors) {
    throw new Error("Stored face descriptor is invalid.");
  }

  return descriptors;
};

export const getFaceDescriptorDistance = (left, right) => {
  if (
    !Array.isArray(left) ||
    !Array.isArray(right) ||
    left.length !== FACE_DESCRIPTOR_SIZE ||
    right.length !== FACE_DESCRIPTOR_SIZE
  ) {
    return Number.POSITIVE_INFINITY;
  }

  let squaredDistance = 0;
  for (let index = 0; index < FACE_DESCRIPTOR_SIZE; index += 1) {
    const difference = left[index] - right[index];
    squaredDistance += difference * difference;
  }

  return Math.sqrt(squaredDistance);
};

const readThreshold = (name, fallback, allowZero = false) => {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === "") return fallback;
  const value = Number(rawValue);
  const min = allowZero ? 0 : Number.EPSILON;

  if (!Number.isFinite(value) || value < min || value > 1) {
    throw new Error(`${name} must be ${allowZero ? "between 0" : "greater than 0"} and 1.`);
  }

  return value;
};

export const getFaceMatchThreshold = () =>
  readThreshold("FACE_MATCH_MAX_DISTANCE", 0.52);

export const getFaceDuplicateThreshold = () =>
  readThreshold("FACE_DUPLICATE_MAX_DISTANCE", 0.36);

export const getFaceMatchMinMargin = () =>
  readThreshold("FACE_MATCH_MIN_MARGIN", 0.06, true);
