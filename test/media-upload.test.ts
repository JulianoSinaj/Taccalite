import { describe, it, expect } from "vitest";
import { sniffImageKind, isSafeMediaName, saveUploadedImage } from "@/lib/media";

/**
 * An upload is whatever its first bytes say it is.
 *
 * `File.type` is the browser's Content-Type on the multipart part — which is to
 * say, whatever the client wrote there. Trusting it meant any bytes at all could
 * be stored and served back from the shop's own domain under an image content
 * type, at a stable public URL. `nosniff` and a non-executable content type keep
 * that short of stored XSS, but "the only thing standing between this and a
 * hosted payload is a response header" is not where the check belongs.
 */

const jpg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const png = () =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const webp = () =>
  Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(64)]);
const avif = () =>
  Buffer.concat([Buffer.alloc(4), Buffer.from("ftyp"), Buffer.from("avif"), Buffer.alloc(64)]);

const asFile = (bytes: Buffer, type: string, name = "x") =>
  new File([new Uint8Array(bytes)], name, { type });

describe("sniffImageKind", () => {
  it("recognises the four formats the shop accepts", () => {
    expect(sniffImageKind(jpg())).toBe("jpg");
    expect(sniffImageKind(png())).toBe("png");
    expect(sniffImageKind(webp())).toBe("webp");
    expect(sniffImageKind(avif())).toBe("avif");
  });

  it("refuses anything else, however it is labelled", () => {
    expect(sniffImageKind(Buffer.from("<script>alert(1)</script>padding-padding"))).toBeNull();
    expect(sniffImageKind(Buffer.from("%PDF-1.7\n%padding padding padding"))).toBeNull();
    expect(sniffImageKind(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull(); // MZ
  });

  it("refuses a RIFF container that is not WebP", () => {
    const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(64)]);
    expect(sniffImageKind(wav)).toBeNull();
  });

  it("refuses something too short to identify", () => {
    expect(sniffImageKind(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
  });
});

describe("saveUploadedImage", () => {
  it("refuses a payload wearing an image content type", async () => {
    const disguised = asFile(Buffer.from("<html><script>alert(1)</script></html>"), "image/jpeg", "cat.jpg");
    await expect(saveUploadedImage(disguised)).rejects.toThrow(/non è un'immagine valida/);
  });

  it("refuses a type the shop does not accept at all", async () => {
    await expect(saveUploadedImage(asFile(jpg(), "image/gif"))).rejects.toThrow(/non supportato/);
  });

  it("refuses an empty file", async () => {
    await expect(saveUploadedImage(asFile(Buffer.alloc(0), "image/jpeg"))).rejects.toThrow(/vuoto/);
  });

  it("stores a real image under a generated name, never the client's", async () => {
    const stored = await saveUploadedImage(asFile(png(), "image/png", "../../etc/passwd.png"));
    const name = stored.split("/").pop()!;

    expect(name).not.toContain("passwd");
    expect(name.endsWith(".png")).toBe(true);
    expect(isSafeMediaName(name)).toBe(true);
  });

  it("takes the extension from the bytes, not from the claim", async () => {
    // A genuine PNG announced as a JPEG is stored as what it is.
    const stored = await saveUploadedImage(asFile(png(), "image/jpeg"));
    expect(stored.endsWith(".png")).toBe(true);
  });
});

describe("isSafeMediaName", () => {
  it("blocks traversal and anything not in the generated shape", () => {
    expect(isSafeMediaName("abc123.jpg")).toBe(true);
    expect(isSafeMediaName("../../../etc/passwd")).toBe(false);
    expect(isSafeMediaName("a/b.jpg")).toBe(false);
    expect(isSafeMediaName("a.jpg.exe")).toBe(false);
    expect(isSafeMediaName("a.svg")).toBe(false);
  });
});
