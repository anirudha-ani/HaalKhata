/** Tests for this phone's push state: when it registers, when it asks, and what sign-out leaves behind. */

import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  permissions: { status: "undetermined", ios: { status: 0 } } as { status: string; ios?: { status: number } },
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  setBadgeCountAsync: vi.fn(),
  dismissAllNotificationsAsync: vi.fn(),
  registerDevice: vi.fn(),
  removeDevice: vi.fn(),
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { version: "1.1.0", extra: { eas: { projectId: "project-1" } } }, easConfig: undefined },
}));
vi.mock("expo-device", () => ({ modelName: "iPhone 17" }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "install-1" }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (storageKey: string) => native.storage.get(storageKey) ?? null),
  setItemAsync: vi.fn(async (storageKey: string, value: string) => void native.storage.set(storageKey, value)),
  deleteItemAsync: vi.fn(async (storageKey: string) => void native.storage.delete(storageKey)),
}));
vi.mock("expo-notifications", () => ({
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  getPermissionsAsync: native.getPermissionsAsync,
  requestPermissionsAsync: native.requestPermissionsAsync,
  getExpoPushTokenAsync: native.getExpoPushTokenAsync,
  setBadgeCountAsync: native.setBadgeCountAsync,
  dismissAllNotificationsAsync: native.dismissAllNotificationsAsync,
}));
vi.mock("@/lib/api/connect", () => ({
  pushClient: { registerDevice: native.registerDevice, removeDevice: native.removeDevice },
  errorMessage: (error: Error) => error.message,
}));

/** iOS authorization statuses as expo-notifications reports them. */
const IOS_STATUS = { undetermined: 0, denied: 1, authorized: 2 };

/**
 * Sets what the phone reports for its permission.
 *
 * @param iosStatus - One of {@link IOS_STATUS}.
 */
function permissionIs(iosStatus: number): void {
  native.permissions = { status: iosStatus === IOS_STATUS.authorized ? "granted" : "undetermined", ios: { status: iosStatus } };
}

/** @returns A fresh copy of the store, with no state left from another test. */
async function freshStore() {
  vi.resetModules();
  return import("./pushStore");
}

beforeEach(() => {
  vi.clearAllMocks();
  native.storage.clear();
  permissionIs(IOS_STATUS.undetermined);
  native.getPermissionsAsync.mockImplementation(async () => native.permissions);
  native.requestPermissionsAsync.mockImplementation(async () => native.permissions);
  native.getExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[abc]" });
  native.registerDevice.mockResolvedValue({ id: "dev-1" });
  native.removeDevice.mockResolvedValue({});
  native.setBadgeCountAsync.mockResolvedValue(true);
  native.dismissAllNotificationsAsync.mockResolvedValue(undefined);
});

describe("syncThisPhone", () => {
  it("does nothing, and asks nothing, until notifications are allowed", async () => {
    const store = await freshStore();
    await store.refreshPushPermission();
    await store.syncThisPhone();
    expect(native.registerDevice).not.toHaveBeenCalled();
    expect(native.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("registers an allowed phone with its token, installation, model and version, once a day", async () => {
    permissionIs(IOS_STATUS.authorized);
    const store = await freshStore();
    await store.refreshPushPermission();
    await store.syncThisPhone();
    expect(native.registerDevice).toHaveBeenCalledExactlyOnceWith({
      expoPushToken: "ExponentPushToken[abc]",
      installationId: "install-1",
      platform: "ios",
      label: "iPhone 17",
      appVersion: "1.1.0",
    });
    expect(store.pushState().deviceId).toBe("dev-1");
    await store.syncThisPhone();
    expect(native.registerDevice).toHaveBeenCalledOnce();
    await store.syncThisPhone(true);
    expect(native.registerDevice).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed registration for the Account card instead of throwing", async () => {
    permissionIs(IOS_STATUS.authorized);
    native.registerDevice.mockRejectedValue(new Error("server down"));
    const store = await freshStore();
    await store.refreshPushPermission();
    await expect(store.syncThisPhone()).resolves.toBeUndefined();
    expect(store.pushState()).toMatchObject({ registering: false, deviceId: null });
    expect(store.pushState().error).toContain("server down");
  });
});

describe("offerPushExplainer", () => {
  it("opens once per phone, only before iOS has asked", async () => {
    const store = await freshStore();
    await store.offerPushExplainer();
    expect(store.pushState().explainerOpen).toBe(true);
    store.closePushExplainer();
    await store.offerPushExplainer();
    expect(store.pushState().explainerOpen).toBe(false);
  });

  it("opens again when the person taps Turn on in Account", async () => {
    const store = await freshStore();
    await store.offerPushExplainer();
    store.closePushExplainer();
    await store.offerPushExplainer(true);
    expect(store.pushState().explainerOpen).toBe(true);
  });

  it("never opens once iOS has an answer", async () => {
    permissionIs(IOS_STATUS.denied);
    const store = await freshStore();
    await store.offerPushExplainer(true);
    expect(store.pushState()).toMatchObject({ explainerOpen: false, permission: "denied" });
  });
});

describe("turnOnPush", () => {
  it("connects the phone when the person allows", async () => {
    native.requestPermissionsAsync.mockImplementation(async () => {
      permissionIs(IOS_STATUS.authorized);
      return native.permissions;
    });
    const store = await freshStore();
    expect(await store.turnOnPush()).toBe("granted");
    expect(native.registerDevice).toHaveBeenCalledOnce();
  });

  it("connects nothing when the person refuses", async () => {
    native.requestPermissionsAsync.mockImplementation(async () => {
      permissionIs(IOS_STATUS.denied);
      return native.permissions;
    });
    const store = await freshStore();
    expect(await store.turnOnPush()).toBe("denied");
    expect(native.registerDevice).not.toHaveBeenCalled();
  });
});

describe("forgetThisPhone", () => {
  it("asks the server to forget the phone, then clears the badge and every banner", async () => {
    permissionIs(IOS_STATUS.authorized);
    const store = await freshStore();
    await store.refreshPushPermission();
    await store.syncThisPhone();
    await store.forgetThisPhone();
    expect(native.removeDevice).toHaveBeenCalledWith({ deviceId: "dev-1" });
    expect(native.setBadgeCountAsync).toHaveBeenCalledWith(0);
    expect(native.dismissAllNotificationsAsync).toHaveBeenCalledOnce();
    expect(store.pushState().deviceId).toBeNull();
  });

  it("still clears the phone when the server cannot be reached", async () => {
    native.storage.set("haalkhata-push-device", "dev-1");
    native.removeDevice.mockRejectedValue(new Error("offline"));
    const store = await freshStore();
    await expect(store.forgetThisPhone()).resolves.toBeUndefined();
    expect(native.dismissAllNotificationsAsync).toHaveBeenCalledOnce();
    expect(native.storage.has("haalkhata-push-device")).toBe(false);
  });
});
