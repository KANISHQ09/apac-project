/**
 * Validates a file's content by checking its magic number/file signature (first few bytes).
 * This prevents renaming malicious files (e.g. evil.exe to photo.png) to bypass security.
 */
export async function validateFileSignature(
  file: File,
  allowedMimeTypes: string[]
): Promise<boolean> {
  return new Promise((resolve) => {
    const fileReader = new FileReader();

    // We only need the first 12 bytes to verify standard image signatures
    const slice = file.slice(0, 12);

    fileReader.onloadend = (e) => {
      if (!e.target || e.target.readyState !== FileReader.DONE) {
        resolve(false);
        return;
      }

      const arr = new Uint8Array(e.target.result as ArrayBuffer);
      let header = "";
      for (let i = 0; i < arr.length; i++) {
        header += arr[i].toString(16).toUpperCase().padStart(2, "0");
      }

      let matchedMimeType: string | null = null;

      // Check JPEG: FF D8 FF
      if (header.startsWith("FFD8FF")) {
        matchedMimeType = "image/jpeg";
      }
      // Check PNG: 89 50 4E 47 0D 0A 1A 0A
      else if (header.startsWith("89504E470D0A1A0A")) {
        matchedMimeType = "image/png";
      }
      // Check GIF: 47 49 46 38 (GIF8)
      else if (header.startsWith("47494638")) {
        matchedMimeType = "image/gif";
      }
      // Check WEBP: RIFF (52 49 46 46) at start, WEBP (57 45 42 50) at index 8 (char 16 to 24 in hex string)
      else if (header.startsWith("52494646") && header.substring(16, 24) === "57454250") {
        matchedMimeType = "image/webp";
      }

      if (matchedMimeType && allowedMimeTypes.includes(matchedMimeType)) {
        // Accept matching mime types (standardizing jpg/jpeg aliases)
        const isCompatible =
          file.type === matchedMimeType ||
          (file.type === "image/jpg" && matchedMimeType === "image/jpeg") ||
          (file.type === "image/jpeg" && matchedMimeType === "image/jpg");

        resolve(isCompatible);
      } else {
        resolve(false);
      }
    };

    fileReader.readAsArrayBuffer(slice);
  });
}
