import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_BASELINE = 101;
const ERR_INVALID_USAGE = 102;
const ERR_INVALID_DEVICE_ID = 103;
const ERR_INVALID_TIMESTAMP = 104;
const ERR_INVALID_REDUCTION = 105;
const ERR_DEVICE_ALREADY_REGISTERED = 106;
const ERR_DEVICE_NOT_FOUND = 107;
const ERR_INVALID_ORACLE = 108;
const ERR_INVALID_REDUCTION_TYPE = 109;
const ERR_INVALID_CO2_FACTOR = 110;
const ERR_INVALID_UPDATE_PARAM = 111;
const ERR_MAX_DEVICES_EXCEEDED = 112;
const ERR_INVALID_LOCATION = 113;
const ERR_INVALID_UNIT = 114;
const ERR_INVALID_STATUS = 115;
const ERR_INVALID_OWNER = 116;
const ERR_ORACLE_NOT_VERIFIED = 117;
const ERR_INVALID_PERIOD = 118;
const ERR_CALCULATION_OVERFLOW = 119;
const ERR_INVALID_VERIFICATION = 120;

interface Device {
  owner: string;
  deviceType: string;
  baseline: number;
  location: string;
  unit: string;
  status: boolean;
  lastTimestamp: number;
  co2Factor: number;
}

interface Reduction {
  deviceId: number;
  usage: number;
  timestamp: number;
  reduction: number;
  verifier: string;
  reductionType: string;
  period: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ReductionCalculatorMock {
  state: {
    nextDeviceId: number;
    maxDevices: number;
    oraclePrincipal: string | null;
    defaultCo2Factor: number;
    defaultBaseline: number;
    adminPrincipal: string;
    devices: Map<number, Device>;
    reductions: Map<number, Reduction>;
    devicesByOwner: Map<string, number[]>;
  } = {
    nextDeviceId: 0,
    maxDevices: 10000,
    oraclePrincipal: null,
    defaultCo2Factor: 400,
    defaultBaseline: 1000,
    adminPrincipal: "ST1TEST",
    devices: new Map(),
    reductions: new Map(),
    devicesByOwner: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextDeviceId: 0,
      maxDevices: 10000,
      oraclePrincipal: null,
      defaultCo2Factor: 400,
      defaultBaseline: 1000,
      adminPrincipal: "ST1TEST",
      devices: new Map(),
      reductions: new Map(),
      devicesByOwner: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
  }

  setOraclePrincipal(oracle: string): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (oracle === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_OWNER };
    this.state.oraclePrincipal = oracle;
    return { ok: true, value: true };
  }

  setDefaultCo2Factor(factor: number): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (factor <= 0) return { ok: false, value: ERR_INVALID_CO2_FACTOR };
    this.state.defaultCo2Factor = factor;
    return { ok: true, value: true };
  }

  setDefaultBaseline(baseline: number): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (baseline <= 0) return { ok: false, value: ERR_INVALID_BASELINE };
    this.state.defaultBaseline = baseline;
    return { ok: true, value: true };
  }

  registerDevice(
    deviceType: string,
    baseline: number,
    location: string,
    unit: string,
    co2Factor: number
  ): Result<number> {
    if (this.state.nextDeviceId >= this.state.maxDevices) return { ok: false, value: ERR_MAX_DEVICES_EXCEEDED };
    if (!["energy", "transport", "waste"].includes(deviceType)) return { ok: false, value: ERR_INVALID_REDUCTION_TYPE };
    if (baseline <= 0) return { ok: false, value: ERR_INVALID_BASELINE };
    if (!location || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (!["kWh", "km", "kg"].includes(unit)) return { ok: false, value: ERR_INVALID_UNIT };
    if (co2Factor <= 0) return { ok: false, value: ERR_INVALID_CO2_FACTOR };
    if (!this.state.oraclePrincipal) return { ok: false, value: ERR_ORACLE_NOT_VERIFIED };
    const id = this.state.nextDeviceId;
    const device: Device = {
      owner: this.caller,
      deviceType,
      baseline,
      location,
      unit,
      status: true,
      lastTimestamp: this.blockHeight,
      co2Factor,
    };
    this.state.devices.set(id, device);
    const ownerDevices = this.state.devicesByOwner.get(this.caller) || [];
    ownerDevices.push(id);
    this.state.devicesByOwner.set(this.caller, ownerDevices);
    this.state.nextDeviceId++;
    return { ok: true, value: id };
  }

  submitReduction(
    deviceId: number,
    usage: number,
    timestamp: number,
    reductionType: string,
    period: number
  ): Result<number> {
    const device = this.state.devices.get(deviceId);
    if (!device) return { ok: false, value: ERR_DEVICE_NOT_FOUND };
    if (device.owner !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!device.status) return { ok: false, value: ERR_INVALID_STATUS };
    if (usage < 0) return { ok: false, value: ERR_INVALID_USAGE };
    if (timestamp <= this.blockHeight) return { ok: false, value: ERR_INVALID_TIMESTAMP };
    if (!["energy", "transport", "waste"].includes(reductionType)) return { ok: false, value: ERR_INVALID_REDUCTION_TYPE };
    if (period <= 0 || period > 365) return { ok: false, value: ERR_INVALID_PERIOD };
    if (!this.state.oraclePrincipal || this.caller !== this.state.oraclePrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const reduction = usage < device.baseline ? (device.baseline - usage) * device.co2Factor : 0;
    if (reduction <= 0) return { ok: false, value: ERR_INVALID_REDUCTION };
    const nextId = this.state.reductions.size + 1;
    const red: Reduction = {
      deviceId,
      usage,
      timestamp,
      reduction,
      verifier: this.state.oraclePrincipal,
      reductionType,
      period,
    };
    this.state.reductions.set(nextId, red);
    return { ok: true, value: reduction };
  }

  updateDevice(
    deviceId: number,
    newBaseline: number,
    newCo2Factor: number,
    newLocation: string
  ): Result<boolean> {
    const device = this.state.devices.get(deviceId);
    if (!device) return { ok: false, value: ERR_DEVICE_NOT_FOUND };
    if (device.owner !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newBaseline <= 0) return { ok: false, value: ERR_INVALID_BASELINE };
    if (newCo2Factor <= 0) return { ok: false, value: ERR_INVALID_CO2_FACTOR };
    if (!newLocation || newLocation.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    const updated: Device = {
      ...device,
      baseline: newBaseline,
      co2Factor: newCo2Factor,
      location: newLocation,
      lastTimestamp: this.blockHeight,
    };
    this.state.devices.set(deviceId, updated);
    return { ok: true, value: true };
  }

  getDeviceCount(): Result<number> {
    return { ok: true, value: this.state.nextDeviceId };
  }

  verifyReduction(reductionId: number): Result<boolean> {
    return { ok: true, value: this.state.reductions.has(reductionId) };
  }
}

describe("ReductionCalculator", () => {
  let contract: ReductionCalculatorMock;

  beforeEach(() => {
    contract = new ReductionCalculatorMock();
    contract.reset();
  });

  it("registers a device successfully", () => {
    contract.setOraclePrincipal("ST2TEST");
    const result = contract.registerDevice("energy", 1000, "Home", "kWh", 400);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
  });

  it("rejects device registration without oracle", () => {
    const result = contract.registerDevice("energy", 1000, "Home", "kWh", 400);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ORACLE_NOT_VERIFIED);
  });

  it("rejects submission by non-oracle", () => {
    contract.setOraclePrincipal("ST2TEST");
    contract.registerDevice("energy", 1000, "Home", "kWh", 400);
    const result = contract.submitReduction(0, 800, 100, "energy", 30);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("updates device successfully", () => {
    contract.setOraclePrincipal("ST2TEST");
    contract.registerDevice("energy", 1000, "Home", "kWh", 400);
    const result = contract.updateDevice(0, 1200, 450, "Office");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("rejects update by non-owner", () => {
    contract.setOraclePrincipal("ST2TEST");
    contract.registerDevice("energy", 1000, "Home", "kWh", 400);
    contract.caller = "ST3FAKE";
    const result = contract.updateDevice(0, 1200, 450, "Office");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets oracle principal successfully", () => {
    const result = contract.setOraclePrincipal("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("rejects invalid oracle principal", () => {
    const result = contract.setOraclePrincipal("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_OWNER);
  });

  it("sets default co2 factor successfully", () => {
    const result = contract.setDefaultCo2Factor(500);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("rejects invalid co2 factor", () => {
    const result = contract.setDefaultCo2Factor(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CO2_FACTOR);
  });

  it("gets device count correctly", () => {
    contract.setOraclePrincipal("ST2TEST");
    contract.registerDevice("energy", 1000, "Home", "kWh", 400);
    const result = contract.getDeviceCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
  });

  it("rejects max devices exceeded", () => {
    contract.setOraclePrincipal("ST2TEST");
    contract.state.maxDevices = 1;
    contract.registerDevice("energy", 1000, "Home", "kWh", 400);
    const result = contract.registerDevice("transport", 500, "Road", "km", 200);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_DEVICES_EXCEEDED);
  });

  it("rejects invalid reduction type", () => {
    contract.setOraclePrincipal("ST2TEST");
    const result = contract.registerDevice("invalid", 1000, "Home", "kWh", 400);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_REDUCTION_TYPE);
  });
});