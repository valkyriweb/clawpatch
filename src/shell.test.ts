import { describe, expect, it } from "vitest";
import { shellQuotePath } from "./shell.js";

describe("shellQuotePath", () => {
  it("leaves simple paths unquoted", () => {
    expect(shellQuotePath("src/App/App.csproj", "linux")).toBe("src/App/App.csproj");
  });

  it("uses double quotes for Windows cmd paths with spaces", () => {
    expect(shellQuotePath("src/My App/App.csproj", "win32")).toBe('"src/My App/App.csproj"');
  });

  it("escapes percent signs for Windows cmd paths", () => {
    expect(shellQuotePath("src/%USERNAME%/App.csproj", "win32")).toBe(
      '"src/^%USERNAME^%/App.csproj"',
    );
  });

  it("escapes POSIX double-quoted metacharacters", () => {
    expect(shellQuotePath('src/$App/"Project".csproj', "linux")).toBe(
      '"src/\\$App/\\"Project\\".csproj"',
    );
  });

  it("quotes POSIX command separators", () => {
    expect(shellQuotePath("packages/app; touch INJECTED", "linux")).toBe(
      '"packages/app; touch INJECTED"',
    );
  });

  it("escapes POSIX command substitutions inside quoted paths", () => {
    expect(shellQuotePath("packages/$(touch INJECTED)", "linux")).toBe(
      '"packages/\\$(touch INJECTED)"',
    );
  });
});
