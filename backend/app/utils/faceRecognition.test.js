import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  decryptFaceDescriptors,
  encryptFaceDescriptors,
  getFaceDescriptorDistance,
  getFaceMatchThreshold,
  normalizeFaceDescriptors,
} from "./faceRecognition.js";

test("face descriptors are validated and encrypted at rest", () => {
  const previousKey = process.env.FACE_DESCRIPTOR_ENCRYPTION_KEY;
  process.env.FACE_DESCRIPTOR_ENCRYPTION_KEY = randomBytes(32).toString("base64");

  try {
    const descriptors = [Array.from({ length: 128 }, (_, index) => index / 256)];
    const encrypted = encryptFaceDescriptors(descriptors);

    assert.match(encrypted, /^v1\./);
    assert.deepEqual(decryptFaceDescriptors(encrypted), descriptors);
    assert.equal(normalizeFaceDescriptors(descriptors)?.length, 1);
    assert.equal(normalizeFaceDescriptors([[1, 2, 3]]), null);
    assert.equal(getFaceDescriptorDistance(descriptors[0], descriptors[0]), 0);
    assert.equal(
      getFaceDescriptorDistance(descriptors[0], Array(128).fill(0)),
      Math.sqrt(descriptors[0].reduce((sum, value) => sum + value * value, 0)),
    );
    assert.throws(() => decryptFaceDescriptors(`${encrypted.slice(0, -4)}AAAA`));
    const previousThreshold = process.env.FACE_MATCH_MAX_DISTANCE;
    process.env.FACE_MATCH_MAX_DISTANCE = "0";
    assert.throws(() => getFaceMatchThreshold(), /FACE_MATCH_MAX_DISTANCE/);
    if (previousThreshold === undefined) {
      delete process.env.FACE_MATCH_MAX_DISTANCE;
    } else {
      process.env.FACE_MATCH_MAX_DISTANCE = previousThreshold;
    }
  } finally {
    if (previousKey === undefined) {
      delete process.env.FACE_DESCRIPTOR_ENCRYPTION_KEY;
    } else {
      process.env.FACE_DESCRIPTOR_ENCRYPTION_KEY = previousKey;
    }
  }
});
