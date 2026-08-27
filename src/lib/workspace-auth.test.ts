import { describe, expect, it } from "vitest";
import { createInviteToken, hashInviteToken, hashPassword, verifyPassword } from "./workspace-auth";

describe("workspace account credentials", () => {
  it("hashes passwords with a unique salt and verifies only the original value", async () => {
    const first = await hashPassword("a sufficiently long password");
    const second = await hashPassword("a sufficiently long password");
    expect(first).not.toBe(second);
    await expect(verifyPassword("a sufficiently long password", first)).resolves.toBe(true);
    await expect(verifyPassword("the wrong password", first)).resolves.toBe(false);
  });

  it("stores only a deterministic digest of invitation tokens", () => {
    const invite = createInviteToken();
    expect(invite.token).toHaveLength(43);
    expect(invite.hash).toBe(hashInviteToken(invite.token));
    expect(invite.hash).not.toContain(invite.token);
  });
});
