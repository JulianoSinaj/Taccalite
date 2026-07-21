import { describe, it, expect } from "vitest";
import { csvEscape, toCsv } from "@/lib/csv";

describe("csvEscape", () => {
  it("passes plain values through unchanged", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape(42)).toBe("42");
    expect(csvEscape(0)).toBe("0");
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("quotes and escapes values containing comma, quote, or newline", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralizes spreadsheet formula-injection payloads", () => {
    expect(csvEscape("=1+1")).toBe("'=1+1");
    expect(csvEscape("+1")).toBe("'+1");
    expect(csvEscape("-1")).toBe("'-1");
    expect(csvEscape("@SUM(1)")).toBe("'@SUM(1)");
    expect(csvEscape("\tx")).toBe("'\tx");
  });

  it("prefixes AND quotes a formula that also contains a comma", () => {
    expect(csvEscape("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvEscape("=a,b")).toBe("\"'=a,b\"");
  });
});

describe("toCsv", () => {
  it("joins headers + rows with CRLF and commas", () => {
    const csv = toCsv(["a", "b"], [
      ["1", "2"],
      ["x", "y"],
    ]);
    expect(csv).toBe("a,b\r\n1,2\r\nx,y");
  });

  it("escapes cells within the serialized output", () => {
    const csv = toCsv(["name"], [["=cmd"]]);
    expect(csv).toBe("name\r\n'=cmd");
  });
});
