import { describe, expect, it } from "vitest";
import { dynamicEmployeeCode, employeeCodeSuffix } from "./ids";

describe("dynamicEmployeeCode", () => {
  it("builds the requested master-derived code", () => {
    expect(
      dynamicEmployeeCode({
        cityCode: "BLR",
        outletModelCode: "COR",
        specialCode: "IDN",
        numberOfOutlets: 1,
        departmentCode: "TCWG",
        employeeRoleCode: "CEO",
        employeeCode: "EMP0001",
      }),
    ).toBe("BLR-COR-IDN-1-TCWG-CEO-0001");
  });

  it("waits until every dependent master field is present", () => {
    expect(
      dynamicEmployeeCode({
        cityCode: "BLR",
        outletModelCode: null,
        specialCode: "IDN",
        numberOfOutlets: 1,
        departmentCode: "TCWG",
        employeeRoleCode: "CEO",
        employeeCode: "EMP0001",
      }),
    ).toBeNull();
  });

  it("uses the numeric Employee Code suffix", () => {
    expect(employeeCodeSuffix("EMP42")).toBe("0042");
  });
});
