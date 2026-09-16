import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import * as yazl from "yazl";
import { POST } from "../app/api/skills/github/import/route";

const skillMd = `---
name: Route Import Skill
description: Route import test
version: 1.0.0
---
`;

function createZip() {
  return new Promise<Buffer>((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const chunks: Buffer[] = [];
    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.once("error", reject);
    zip.outputStream.once("end", () => resolve(Buffer.concat(chunks)));
    zip.addBuffer(Buffer.from(skillMd), "repo/SKILL.md");
    zip.end();
  });
}

function request(body: unknown) {
  return new Request("http://localhost/api/skills/github/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GitHub import route", () => {
  it("returns the stable preview contract and ignores client owner fields", async () => {
    const archive = await createZip();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        calls.push(String(input));
        if (calls.length === 1) {
          return new Response(
            JSON.stringify({
              full_name: "example/route-skill",
              private: false,
              default_branch: "main",
              html_url: "https://github.com/example/route-skill",
            }),
            { status: 200 },
          );
        }
        return new Response(new Uint8Array(archive), { status: 200 });
      }),
    );

    const response = await POST(
      request({
        url: "https://github.com/example/route-skill",
        ownerId: "attacker-controlled-owner",
        userId: "attacker-controlled-user",
      }),
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload).not.toHaveProperty("ownerId");
    expect(payload).not.toHaveProperty("userId");
    expect(payload).toHaveProperty("repository");
    expect(payload).toHaveProperty("packageBase64");
    expect(calls[0]).toBe("https://api.github.com/repos/example/route-skill");
    expect(calls[0]).not.toContain("attacker");
  });

  it("returns Chinese errors for invalid URLs", async () => {
    const response = await POST(
      request({ url: "https://evil.example/owner/repo" }),
    );
    const payload = (await response.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      success: false,
      error: {
        code: "UNSUPPORTED_HOST",
        message: "目前仅支持 GitHub.com",
      },
    });
  });
});
