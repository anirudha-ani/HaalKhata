/** Which connection string the pool opens with, and where the secret in it comes from. */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DATABASE_URL } from "./db.constants";
import { databaseUrl } from "./db";

const MANAGED_URL = "postgres://app:managed-secret-1234567890@db.example.com:25060/app?sslmode=verify-full";
const ENVIRONMENT_URL = "postgres://haalkhata:from-environment@localhost:5432/haalkhata";
const CONNECTION_VARIABLES = [
  "DATABASE_URL",
  "DATABASE_URL_FILE",
  "POSTGRES_PASSWORD",
  "POSTGRES_PASSWORD_FILE",
  "POSTGRES_USER",
  "POSTGRES_HOST",
  "POSTGRES_PORT",
  "POSTGRES_DB",
];

let secretsDirectory: string;

/**
 * Writes a secret the way Docker mounts one, with the trailing newline an
 * editor leaves.
 *
 * @param name - The file's name.
 * @param value - Its contents.
 * @returns The file's path.
 */
function secretFile(name: string, value: string): string {
  const filePath = path.join(secretsDirectory, name);
  writeFileSync(filePath, `${value}\n`);
  return filePath;
}

beforeEach(() => {
  secretsDirectory = mkdtempSync(path.join(tmpdir(), "haalkhata-secrets-"));
  for (const variable of CONNECTION_VARIABLES) vi.stubEnv(variable, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(secretsDirectory, { recursive: true, force: true });
});

describe("databaseUrl", () => {
  it("reads the full URL from DATABASE_URL_FILE, ahead of the variable and the parts", () => {
    vi.stubEnv("DATABASE_URL_FILE", secretFile("database_url", MANAGED_URL));
    vi.stubEnv("DATABASE_URL", ENVIRONMENT_URL);
    vi.stubEnv("POSTGRES_PASSWORD_FILE", secretFile("postgres_password", "old-bundled-password"));

    expect(databaseUrl()).toBe(MANAGED_URL);
  });

  it("refuses a DATABASE_URL_FILE it cannot read rather than connecting somewhere else", () => {
    vi.stubEnv("DATABASE_URL_FILE", path.join(secretsDirectory, "missing"));
    vi.stubEnv("POSTGRES_PASSWORD_FILE", secretFile("postgres_password", "old-bundled-password"));

    expect(() => databaseUrl()).toThrow(/DATABASE_URL_FILE names .*missing, which could not be read/);
  });

  it("still takes a plain DATABASE_URL, as development and tests set it", () => {
    vi.stubEnv("DATABASE_URL", ENVIRONMENT_URL);

    expect(databaseUrl()).toBe(ENVIRONMENT_URL);
  });

  it("assembles the URL from the parts when no full URL is given, encoding the password", () => {
    vi.stubEnv("POSTGRES_PASSWORD_FILE", secretFile("postgres_password", "p@ss/word:1"));
    vi.stubEnv("POSTGRES_HOST", "db");

    expect(databaseUrl()).toBe("postgres://haalkhata:p%40ss%2Fword%3A1@db:5432/haalkhata");
  });

  it("falls back to the development default only when nothing is configured", () => {
    expect(databaseUrl()).toBe(DEFAULT_DATABASE_URL);
  });
});
