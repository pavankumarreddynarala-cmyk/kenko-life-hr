import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { dynamicEmployeeCode } from "../src/lib/ids";

const db = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("KenkoDemo!2026", 10);
  for (const [email, role] of [
    ["Accounts@thekenkolife.com", "HR"],
    ["roshini@thekenkolife.com", "CFO"],
    ["admin@thekenkolife.com", "ADMIN"],
    ["ceo@thekenkolife.com", "CEO"],
    ["coo@thekenkolife.com", "COO"],
  ] as const) {
    await db.user.upsert({ where: { email }, update: {}, create: { email, role, passwordHash: hash } });
  }

  const company = await db.company.upsert({
    where: { code: "TKL" },
    update: {},
    create: { code: "TKL", name: "The Kenko Life" },
  });
  const city = await db.city.upsert({ where: { code: "BLR" }, update: {}, create: { code: "BLR", name: "Bengaluru" } });
  const location = await db.location.upsert({ where: { code: "BLR" }, update: {}, create: { code: "BLR", name: "Bengaluru" } });
  const branch = await db.branch.upsert({ where: { code: "COR" }, update: {}, create: { code: "COR", name: "Corporate", cityId: city.id } });
  const outletModel = await db.outletModel.upsert({ where: { code: "COR" }, update: {}, create: { code: "COR", name: "Corporate" } });
  const special = await db.specialBranchCode.upsert({ where: { code: "IDN" }, update: {}, create: { code: "IDN", name: "Indiranagar", branchId: branch.id } });
  const department = await db.department.upsert({ where: { code: "TCWG" }, update: {}, create: { code: "TCWG", name: "The Corporate Wellness Group" } });
  const employeeRole = await db.employeeRole.upsert({ where: { code: "CEO" }, update: {}, create: { code: "CEO", name: "Chief Executive Officer" } });
  const permanentId = "EMP0034";
  const dynamicId = dynamicEmployeeCode({
    cityCode: city.code,
    outletModelCode: outletModel.code,
    specialCode: special.code,
    numberOfOutlets: 1,
    departmentCode: department.code,
    employeeRoleCode: employeeRole.code,
    employeeCode: permanentId,
  });
  const employee = await db.employee.upsert({
    where: { permanentId },
    update: { dynamicId },
    create: {
      permanentId,
      dynamicId,
      name: "John Doe",
      phone: "+919876543210",
      email: "john@example.test",
      companyId: company.id,
      locationId: location.id,
      cityId: city.id,
      branchId: branch.id,
      outletModelId: outletModel.id,
      specialBranchCodeId: special.id,
      departmentId: department.id,
      employeeRoleId: employeeRole.id,
      numberOfOutlets: 1,
    },
  });
  await db.$executeRaw`SELECT setval('employee_code_seq', GREATEST((SELECT COALESCE(MAX(SUBSTRING("permanentId" FROM '[0-9]+$')::BIGINT), 0) FROM "Employee"), 1))`;

  const asset = await db.fixedAsset.upsert({
    where: { faId: "FA000034" },
    update: {},
    create: {
      faId: "FA000034",
      category: "Laptop",
      description: "MacBook Pro 14 inch",
      makeModel: "Apple M3 Pro",
      serialNo: "KENKO-DEMO-034",
      status: "ASSIGNED",
      companyId: company.id,
      locationId: location.id,
      departmentId: department.id,
    },
  });
  const existingAssignment = await db.assetAssignment.findFirst({ where: { assetId: asset.id, returnedAt: null } });
  if (!existingAssignment) {
    await db.assetAssignment.create({ data: { assetId: asset.id, custodianType: "EMPLOYEE", employeeId: employee.id } });
  }
  await db.assetQRCode.upsert({
    where: { assetId: asset.id },
    update: {},
    create: { assetId: asset.id, token: randomUUID() },
  });
}

main().finally(() => db.$disconnect());
