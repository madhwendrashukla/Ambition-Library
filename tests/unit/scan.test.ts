import { describe, expect, it } from "vitest";
import { extractGateKey, extractStudentToken } from "@/lib/scan";

const KEY = "c7303567848849929f8e8b36";
describe("extractGateKey", () => {
  it("reads printed gate URL", () => expect(extractGateKey(`https://ambition.vercel.app/app/scan?k=${KEY}`)).toBe(KEY));
  it("reads URL with extra params", () => expect(extractGateKey(`https://x.in/app/scan?utm=1&k=${KEY}#top`)).toBe(KEY));
  it("reads bare key", () => expect(extractGateKey(KEY)).toBe(KEY));
  it("trims whitespace/newlines", () => expect(extractGateKey(`  ${KEY}\n`)).toBe(KEY));
  it("flags personal QR", () => expect(extractGateKey("AL-STU:abcdef123456")).toBe("__personal__"));
  it.each([
    ["empty", ""],
    ["random sentence", "hello world"],
    ["URL without k", "https://google.com/search?q=x"],
    ["k too short", "https://x.in/app/scan?k=abc"],
    ["injection-ish", "abc'; drop table--"],
    ["UPI QR", "upi://pay?pa=x@upi&pn=Shop"],
  ])("rejects %s", (_n, v) => expect(extractGateKey(v)).toBeNull());
});

describe("extractStudentToken", () => {
  it("reads personal QR", () => expect(extractStudentToken("AL-STU:abcdef123456")).toBe("abcdef123456"));
  it("rejects gate URL", () => expect(extractStudentToken(`https://x.in/app/scan?k=${KEY}`)).toBeNull());
  it("rejects bare text", () => expect(extractStudentToken("abcdef123456")).toBeNull());
  it("rejects empty token", () => expect(extractStudentToken("AL-STU:")).toBeNull());
});
