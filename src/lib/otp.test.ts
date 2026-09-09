import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const otpRecords = vi.hoisted(() => ({
  create: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { employeeOtp: otpRecords },
}));

import { sendOtp, verifyOtp } from "./otp";

beforeEach(() => {
  vi.stubEnv("OTP_PROVIDER", "development");
  vi.stubEnv("DEV_OTP", "654321");
  vi.stubEnv("NODE_ENV", "test");
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("development OTP provider", () => {
  it("stores a hashed OTP against the normalized phone", async () => {
    otpRecords.create.mockResolvedValue({ id: "otp-1" });

    await sendOtp("+916300277087", "127.0.0.1");

    expect(otpRecords.create).toHaveBeenCalledOnce();
    const data = otpRecords.create.mock.calls[0][0].data;
    expect(data.phone).toBe("+916300277087");
    expect(data.requestIp).toBe("127.0.0.1");
    expect(await bcrypt.compare("654321", data.codeHash)).toBe(true);
  });

  it("verifies and consumes the latest valid OTP", async () => {
    otpRecords.findFirst.mockResolvedValue({
      id: "otp-1",
      attempts: 0,
      codeHash: await bcrypt.hash("654321", 4),
    });
    otpRecords.update.mockResolvedValue({ id: "otp-1" });

    await expect(verifyOtp("+916300277087", "654321")).resolves.toBe(true);
    expect(otpRecords.update).toHaveBeenCalledWith({
      where: { id: "otp-1" },
      data: { verifiedAt: expect.any(Date) },
    });
  });

  it("increments attempts for an invalid OTP", async () => {
    otpRecords.findFirst.mockResolvedValue({
      id: "otp-1",
      attempts: 0,
      codeHash: await bcrypt.hash("654321", 4),
    });
    otpRecords.update.mockResolvedValue({ id: "otp-1" });

    await expect(verifyOtp("+916300277087", "111111")).resolves.toBe(false);
    expect(otpRecords.update).toHaveBeenCalledWith({
      where: { id: "otp-1" },
      data: { attempts: { increment: 1 } },
    });
  });
});
