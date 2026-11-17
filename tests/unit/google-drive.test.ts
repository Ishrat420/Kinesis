import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clerkUser: { id: "user_clerk", externalAccounts: [] as { provider: string; approvedScopes: string; emailAddress: string }[] },
  settings: { googleDriveEnabled: true } as { googleDriveEnabled: boolean } | null,
  getUserOauthAccessToken: vi.fn(),
  setDocumentDriveFile: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ users: { getUserOauthAccessToken: mocks.getUserOauthAccessToken } }) }));
vi.mock("@/lib/auth", () => ({ getAuthenticatedClerkUser: async () => mocks.clerkUser }));
vi.mock("@/lib/data/prisma", () => ({ prisma: { userSettings: { findUnique: async () => mocks.settings } } }));
vi.mock("@/lib/data/documents", () => ({ setDocumentDriveFile: mocks.setDocumentDriveFile }));

import { DRIVE_FILE_SCOPE, driveConnectionState, driveFileName, hasDriveScope, isDriveFileId, parseDriveFile } from "@/lib/google-drive/shared";
import { attachDriveFile, getDriveAccessToken, getDriveConnection, lookUpDriveFile } from "@/lib/google-drive/server";
import { DriveUploadError, uploadToDrive } from "@/lib/google-drive/upload";
import { ActionRefusal } from "@/lib/actions/refusal";

const FILE_ID = "1AbCdEfGhIjKlMnOp_q-r";
const driveJson = (overrides: Record<string, unknown> = {}) => ({
  id: FILE_ID, name: "Passport — scan.pdf", mimeType: "application/pdf",
  webViewLink: `https://drive.google.com/file/d/${FILE_ID}/view`, thumbnailLink: "https://lh3.googleusercontent.com/t", trashed: false, ...overrides,
});
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });
const googleAccount = (scopes: string) => ({ provider: "oauth_google", approvedScopes: scopes, emailAddress: "me@example.com" });

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  mocks.clerkUser.externalAccounts = [googleAccount(`openid email ${DRIVE_FILE_SCOPE}`)];
  mocks.settings = { googleDriveEnabled: true };
  mocks.getUserOauthAccessToken.mockResolvedValue({ data: [{ token: "access-token", scopes: ["openid", DRIVE_FILE_SCOPE] }] });
});
afterEach(() => vi.unstubAllGlobals());

describe("connection state", () => {
  it("needs the drive.file scope itself, not just a Google account", () => {
    expect(hasDriveScope(`openid ${DRIVE_FILE_SCOPE}`)).toBe(true);
    expect(hasDriveScope("openid https://www.googleapis.com/auth/drive.file.extra")).toBe(false);
    expect(hasDriveScope(null)).toBe(false);
  });

  it.each([
    [undefined, true, "not-linked"],
    [{ approvedScopes: "openid email" }, true, "needs-permission"],
    [{ approvedScopes: DRIVE_FILE_SCOPE }, false, "disabled"],
    [{ approvedScopes: DRIVE_FILE_SCOPE }, true, "connected"],
  ] as const)("%o, enabled %s → %s", (account, enabled, state) => {
    expect(driveConnectionState(account, enabled)).toBe(state);
  });

  it("reads the Google account Clerk linked, and the Disconnect setting", async () => {
    await expect(getDriveConnection("kinesis-user")).resolves.toEqual({ state: "connected", email: "me@example.com" });
    mocks.settings = { googleDriveEnabled: false };
    await expect(getDriveConnection("kinesis-user")).resolves.toEqual({ state: "disabled", email: "me@example.com" });
  });
});

describe("driveFileName", () => {
  it("puts the document's name in front of the original file name", () => {
    expect(driveFileName("Passport", "scan_0412.pdf")).toBe("Passport — scan_0412.pdf");
  });

  it("doesn't repeat a name that's already the file name", () => {
    expect(driveFileName("scan.pdf", "scan.pdf")).toBe("scan.pdf");
  });

  it("replaces characters a synced folder can't hold", () => {
    expect(driveFileName("Car / home: insurance", "a?b.pdf")).toBe("Car home insurance — a b.pdf");
  });

  it("keeps long names to 200 characters and keeps the extension", () => {
    const name = driveFileName("x".repeat(300), "scan.pdf");
    expect(name).toHaveLength(200);
    expect(name.endsWith("….pdf")).toBe(true);
  });
});

describe("parseDriveFile and isDriveFileId", () => {
  it("accepts Drive's answer and drops a non-https link", () => {
    expect(parseDriveFile(driveJson())?.id).toBe(FILE_ID);
    expect(parseDriveFile(driveJson({ webViewLink: "javascript:alert(1)" }))).toBeNull();
    expect(parseDriveFile(driveJson({ thumbnailLink: "http://insecure" }))?.thumbnailLink).toBeNull();
  });

  it("only lets plain Drive IDs near a Drive URL", () => {
    expect(isDriveFileId(FILE_ID)).toBe(true);
    expect(isDriveFileId("../../files")).toBe(false);
    expect(isDriveFileId("short")).toBe(false);
  });
});

describe("getDriveAccessToken", () => {
  it("doesn't ask Clerk for a token when Drive isn't connected", async () => {
    mocks.settings = { googleDriveEnabled: false };
    await expect(getDriveAccessToken("kinesis-user")).resolves.toBeNull();
    expect(mocks.getUserOauthAccessToken).not.toHaveBeenCalled();
  });

  it("returns Clerk's Google token when it covers Drive", async () => {
    await expect(getDriveAccessToken("kinesis-user")).resolves.toBe("access-token");
    expect(mocks.getUserOauthAccessToken).toHaveBeenCalledWith("user_clerk", "google");
  });

  it("refuses a token that doesn't cover Drive", async () => {
    mocks.getUserOauthAccessToken.mockResolvedValue({ data: [{ token: "login-only", scopes: ["openid", "email"] }] });
    await expect(getDriveAccessToken("kinesis-user")).resolves.toBeNull();
  });
});

describe("lookUpDriveFile", () => {
  it("reads metadata only, with the person's token", async () => {
    fetchMock.mockResolvedValue(json(driveJson()));
    const result = await lookUpDriveFile("access-token", FILE_ID);
    expect(result).toMatchObject({ status: "found", file: { name: "Passport — scan.pdf" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(new RegExp(`^https://www.googleapis.com/drive/v3/files/${FILE_ID}\\?fields=`));
    expect(String(url)).not.toContain("alt=media");
    expect(init?.headers).toEqual({ Authorization: "Bearer access-token" });
  });

  it.each([
    ["deleted", () => json({}, { status: 404 })],
    ["no longer shared", () => json({ error: { errors: [{ reason: "forbidden" }] } }, { status: 403 })],
    ["in the bin", () => json(driveJson({ trashed: true }))],
  ])("calls a %s file missing", async (_case, response) => {
    fetchMock.mockResolvedValue(response());
    await expect(lookUpDriveFile("access-token", FILE_ID)).resolves.toEqual({ status: "missing" });
  });

  it("doesn't mistake Google's rate limit or an outage for a missing file", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { errors: [{ reason: "userRateLimitExceeded" }] } }, { status: 403 }));
    await expect(lookUpDriveFile("access-token", FILE_ID)).resolves.toEqual({ status: "error" });
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    await expect(lookUpDriveFile("access-token", FILE_ID)).resolves.toEqual({ status: "error" });
  });

  it("never sends a malformed ID to Google", async () => {
    await expect(lookUpDriveFile("access-token", "../other")).resolves.toEqual({ status: "missing" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("attachDriveFile", () => {
  it("stores what Drive says about the file", async () => {
    fetchMock.mockResolvedValue(json(driveJson()));
    await expect(attachDriveFile("kinesis-user", "doc-1", FILE_ID)).resolves.toEqual({ ok: true });
    expect(mocks.setDocumentDriveFile).toHaveBeenCalledWith("doc-1", {
      id: FILE_ID, name: "Passport — scan.pdf", mimeType: "application/pdf", webViewLink: `https://drive.google.com/file/d/${FILE_ID}/view`,
    });
  });

  it("stores nothing when Drive can't find the file", async () => {
    fetchMock.mockResolvedValue(json({}, { status: 404 }));
    await expect(attachDriveFile("kinesis-user", "doc-1", FILE_ID)).resolves.toEqual({ error: "That file isn't in your Google Drive." });
    expect(mocks.setDocumentDriveFile).not.toHaveBeenCalled();
  });

  it("stores nothing without Drive connected", async () => {
    mocks.clerkUser.externalAccounts = [];
    await expect(attachDriveFile("kinesis-user", "doc-1", FILE_ID)).resolves.toHaveProperty("error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns a refusal (the document is gone) into a message", async () => {
    fetchMock.mockResolvedValue(json(driveJson()));
    mocks.setDocumentDriveFile.mockRejectedValue(new ActionRefusal("This document no longer exists."));
    await expect(attachDriveFile("kinesis-user", "doc-1", FILE_ID)).resolves.toEqual({ error: "This document no longer exists." });
  });
});

describe("uploadToDrive", () => {
  const SESSION = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=abc";
  const file = () => new File(["%PDF-1.7"], "scan.pdf", { type: "application/pdf" });

  it("creates Kinesis/Documents the first time, then uploads into it", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ files: [] }))
      .mockResolvedValueOnce(json({ id: "folder-kinesis" }))
      .mockResolvedValueOnce(json({ files: [] }))
      .mockResolvedValueOnce(json({ id: "folder-documents" }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { Location: SESSION } }))
      .mockResolvedValueOnce(json({ id: FILE_ID }));

    await expect(uploadToDrive(file(), "Passport — scan.pdf", "access-token")).resolves.toBe(FILE_ID);

    const bodies = fetchMock.mock.calls.map(([, init]) => (typeof init?.body === "string" ? JSON.parse(init.body) : init?.body));
    expect(bodies[1]).toEqual({ name: "Kinesis", mimeType: "application/vnd.google-apps.folder", parents: ["root"] });
    expect(bodies[3]).toEqual({ name: "Documents", mimeType: "application/vnd.google-apps.folder", parents: ["folder-kinesis"] });
    expect(bodies[4]).toEqual({ name: "Passport — scan.pdf", mimeType: "application/pdf", parents: ["folder-documents"] });
    expect(fetchMock.mock.calls[5][0]).toBe(SESSION);
    expect(fetchMock.mock.calls[5][1]?.method).toBe("PUT");
  });

  it("reuses the folders once they exist", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ files: [{ id: "folder-kinesis" }] }))
      .mockResolvedValueOnce(json({ files: [{ id: "folder-documents" }] }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { Location: SESSION } }))
      .mockResolvedValueOnce(json({ id: FILE_ID }));
    await expect(uploadToDrive(file(), "scan.pdf", "access-token")).resolves.toBe(FILE_ID);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("refuses a file over 10 MB without contacting Google", async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" });
    await expect(uploadToDrive(big, "big.pdf", "access-token")).rejects.toMatchObject({ kind: "too-large" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks to reconnect when Google refuses the token", async () => {
    fetchMock.mockResolvedValue(json({}, { status: 401 }));
    const failure = await uploadToDrive(file(), "scan.pdf", "expired").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(DriveUploadError);
    expect(failure).toMatchObject({ kind: "permission" });
  });

  it("won't send the file anywhere but Google", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ files: [{ id: "folder-kinesis" }] }))
      .mockResolvedValueOnce(json({ files: [{ id: "folder-documents" }] }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { Location: "https://evil.example/upload" } }));
    await expect(uploadToDrive(file(), "scan.pdf", "access-token")).rejects.toMatchObject({ kind: "failed" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
