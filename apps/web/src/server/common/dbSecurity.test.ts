/** Tests for production database credential guardrails. */

import { describe, expect, it } from "vitest";
import { assertSafeDatabaseUrl } from "./db";

describe("assertSafeDatabaseUrl", () => {
  it.each([
    "postgres://haalkhata:haalkhata@db:5432/haalkhata",
    "postgres://haalkhata:change-me@db:5432/haalkhata",
    "postgres://haalkhata:short-secret@database.internal:5432/haalkhata",
  ])("rejects weak production credentials regardless of host: %s", (connectionString) => {
    expect(() => assertSafeDatabaseUrl(connectionString, "production")).toThrow(/password/);
  });

  it("accepts a sufficiently long URL-encoded production password", () => {
    expect(() =>
      assertSafeDatabaseUrl(
        "postgresql://haalkhata:long-random%40password-0123456789@db:5432/haalkhata",
        "production",
      ),
    ).not.toThrow();
  });

  it("rejects missing credentials and malformed production URLs", () => {
    expect(() => assertSafeDatabaseUrl("not a URL", "production")).toThrow(/valid PostgreSQL URL/);
    expect(() =>
      assertSafeDatabaseUrl("postgres://db:5432/haalkhata", "production"),
    ).toThrow(/credentials/);
  });

  it.each([
    "postgres://user:password@database.example/ledger",
    "postgres://user:password@database.example/ledger?sslmode=disable",
    "postgres://user:password@database.example/ledger?sslmode=no-verify",
    "postgres://user:password@database.example/ledger?sslmode=require",
    "postgres://user:password@database.example/ledger?sslmode=verify-full&sslmode=disable",
    "postgres://user:password@localhost/ledger?host=database.example",
  ])("rejects a remote database without certificate-verified TLS: %s", (connectionString) => {
    expect(() => assertSafeDatabaseUrl(connectionString, "development")).toThrow(
      /sslmode=verify-full/,
    );
  });

  it.each([
    "postgres://user:password@database.example/ledger?sslmode=verify-full",
    "postgres://user:password@database.example/ledger?sslmode=disable&sslmode=verify-full",
    "postgres://user:password@localhost/ledger?host=database.example&sslmode=verify-full",
  ])("accepts a remote database with certificate-verified TLS: %s", (connectionString) => {
    expect(() => assertSafeDatabaseUrl(connectionString, "development")).not.toThrow();
  });

  it.each([
    "postgres://haalkhata:change-me@localhost:5432/haalkhata",
    "postgres://haalkhata:change-me@127.0.0.1:5432/haalkhata",
    "postgres://haalkhata:change-me@[::1]:5432/haalkhata",
    "postgres://haalkhata:change-me@db:5432/haalkhata",
    "postgres://haalkhata:change-me@localhost/haalkhata?host=%2Fvar%2Frun%2Fpostgresql",
  ])("allows plaintext only for a local database transport: %s", (connectionString) => {
    expect(() => assertSafeDatabaseUrl(connectionString, "development")).not.toThrow();
  });
});
