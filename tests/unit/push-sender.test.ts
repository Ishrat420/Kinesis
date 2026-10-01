import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createECDH, randomBytes } from "node:crypto";
import http, { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";
import webpush from "web-push";

vi.mock("server-only", () => ({}));

import { sendPush } from "@/lib/push/sender";

/**
 * The real web-push library -- VAPID signing and payload encryption included --
 * against a local stand-in for a browser's push service, which answers with
 * whatever status the test asks for. web-push only speaks HTTPS, so its one
 * `https.request` call is pointed at the stand-in over plain HTTP instead.
 */
let server: Server;
let endpoint: string;
let status = 201;
let received: { headers: IncomingHttpHeaders; bodyLength: number } | null = null;

const deviceKeys = createECDH("prime256v1");
deviceKeys.generateKeys();
const target = () => ({
  endpoint,
  p256dh: deviceKeys.getPublicKey().toString("base64url"),
  auth: randomBytes(16).toString("base64url"),
});
const payload = { title: "Do new", body: "Do new is due tomorrow", url: "/todos", tag: "todo:new:TODO_DUE:2030-01-05" };

beforeAll(async () => {
  server = createServer((request, response) => {
    let bodyLength = 0;
    request.on("data", (chunk: Buffer) => { bodyLength += chunk.length; });
    request.on("end", () => {
      received = { headers: request.headers, bodyLength };
      response.writeHead(status).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/push/device`;
  const keys = webpush.generateVAPIDKeys();
  vi.stubEnv("VAPID_PUBLIC_KEY", keys.publicKey);
  vi.stubEnv("VAPID_PRIVATE_KEY", keys.privateKey);
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.test");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  status = 201;
  received = null;
  vi.spyOn(https, "request").mockImplementation(((options: http.RequestOptions, callback: (response: http.IncomingMessage) => void) =>
    http.request({ ...options, agent: undefined }, callback)) as unknown as typeof https.request);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sending a push (KD-053)", () => {
  it("delivers an encrypted, VAPID-signed payload that lives for a day", async () => {
    await expect(sendPush(target(), payload)).resolves.toBe("sent");
    expect(received?.headers.authorization).toMatch(/^vapid t=.+, k=.+$/);
    expect(received?.headers["content-encoding"]).toBe("aes128gcm");
    expect(received?.headers.ttl).toBe(String(24 * 60 * 60));
    // Encrypted: the plain text never goes over the wire.
    expect(received?.bodyLength).toBeGreaterThan(JSON.stringify(payload).length);
  });

  it.each([404, 410])("reports a device the push service no longer knows (%i) as gone", async (code) => {
    status = code;
    await expect(sendPush(target(), payload)).resolves.toBe("gone");
  });

  it("reports anything else as a failure to retry", async () => {
    status = 500;
    await expect(sendPush(target(), payload)).resolves.toBe("failed");
  });
});
