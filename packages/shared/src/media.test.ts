import { describe, expect, it } from "vitest";
import {
  ALLOWED_MEDIA_MIME_TYPES,
  extensionForMimeType,
  mediaStoragePath,
  mediaTypeForMimeType,
  mimeTypeForExtension,
} from "./media";

describe("mediaTypeForMimeType", () => {
  it("separates images from video", () => {
    expect(mediaTypeForMimeType("image/jpeg")).toBe("image");
    expect(mediaTypeForMimeType("image/heic")).toBe("image");
    expect(mediaTypeForMimeType("video/mp4")).toBe("video");
    expect(mediaTypeForMimeType("video/quicktime")).toBe("video");
  });

  it("returns null for what ImagePicker may leave out or hand back unknown", () => {
    expect(mediaTypeForMimeType(null)).toBeNull();
    expect(mediaTypeForMimeType(undefined)).toBeNull();
    expect(mediaTypeForMimeType("")).toBeNull();
    expect(mediaTypeForMimeType("image/gif")).toBeNull();
  });

  it("ignores case and parameters", () => {
    expect(mediaTypeForMimeType("IMAGE/JPEG")).toBe("image");
    expect(mediaTypeForMimeType("video/mp4; codecs=avc1")).toBe("video");
    expect(mediaTypeForMimeType("  image/png  ")).toBe("image");
  });
});

describe("extensionForMimeType", () => {
  it("maps to the extension the file is stored under", () => {
    expect(extensionForMimeType("image/jpeg")).toBe("jpg");
    expect(extensionForMimeType("video/quicktime")).toBe("mov");
  });

  it("returns null for an unknown type", () => {
    expect(extensionForMimeType("application/pdf")).toBeNull();
  });

  it("covers every allowed type", () => {
    for (const mimeType of ALLOWED_MEDIA_MIME_TYPES) {
      expect(extensionForMimeType(mimeType)).not.toBeNull();
      expect(mediaTypeForMimeType(mimeType)).not.toBeNull();
    }
  });
});

describe("mimeTypeForExtension", () => {
  it("round-trips every allowed type", () => {
    for (const mimeType of ALLOWED_MEDIA_MIME_TYPES) {
      const extension = extensionForMimeType(mimeType);
      expect(mimeTypeForExtension(extension)).toBe(mimeType);
    }
  });

  it("accepts what Expo's File.extension hands back", () => {
    expect(mimeTypeForExtension(".MOV")).toBe("video/quicktime");
    expect(mimeTypeForExtension("jpg")).toBe("image/jpeg");
  });

  it("returns null for an unknown or missing extension", () => {
    expect(mimeTypeForExtension("gif")).toBeNull();
    expect(mimeTypeForExtension("")).toBeNull();
    expect(mimeTypeForExtension(null)).toBeNull();
  });
});

describe("mediaStoragePath", () => {
  const userId = "11111111-1111-1111-1111-111111111111";
  const workoutId = "22222222-2222-2222-2222-222222222222";
  const mediaId = "33333333-3333-3333-3333-333333333333";

  // user_id först är vad Storage-policyerna hänger på - de läser
  // (storage.foldername(name))[1]. Byter ordningen går uppladdningen
  // av ett pass som ännu inte synkats inte igenom.
  it("puts the user id first", () => {
    expect(mediaStoragePath(userId, workoutId, mediaId, "jpg")).toBe(
      `${userId}/${workoutId}/${mediaId}.jpg`,
    );
  });

  it("accepts an extension with or without a leading dot", () => {
    const withDot = mediaStoragePath(userId, workoutId, mediaId, ".MOV");
    const without = mediaStoragePath(userId, workoutId, mediaId, "mov");
    expect(withDot).toBe(without);
    expect(withDot.endsWith(`${mediaId}.mov`)).toBe(true);
  });
});
