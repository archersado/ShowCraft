import type { z } from "zod";

import {
  DomainValidationError,
  formatIssues,
  releasePackageSchema,
  validateReleasePackageRelations,
} from "./domain.js";

/**
 * Deterministic JSON helpers shared with the file-backed run store (Story
 * 1.3). Plain-object keys are recursively sorted; array order is preserved so
 * scene and feature business order survives a round trip.
 */

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function isPlainObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableSortValue(value: JsonValue | undefined): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const mapped: JsonValue[] = [];
    for (const element of value) {
      const stableElement = stableSortValue(element);
      if (stableElement !== undefined) {
        mapped.push(stableElement);
      }
    }
    return mapped;
  }
  if (isPlainObject(value)) {
    const sorted: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(value).sort()) {
      const sortedChild = stableSortValue(value[key]);
      if (sortedChild !== undefined) {
        sorted[key] = sortedChild;
      }
    }
    return sorted;
  }
  return value;
}

export function toStableJson(value: unknown): string {
  return JSON.stringify(stableSortValue(value as JsonValue) ?? null, null, 2);
}

export function stableJsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${toStableJson(value)}\n`);
}

export type ParseSuccess<T> = { success: true; value: T };
export type ParseFailure = { success: false; issues: Array<{ path: string; message: string }> };
export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

export function parseWithSchema<Schema extends z.ZodTypeAny>(
  schema: Schema,
  input: unknown,
): ParseResult<z.output<Schema>> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, value: result.data };
  }
  return { success: false, issues: formatIssues(result.error.issues) };
}

/**
 * Parse an aggregate package and enforce cross-object feature relations.
 * Field errors surface first; relation errors come back as parse issues with
 * the offending path.
 */
export function safeParseReleasePackage(
  schema: typeof releasePackageSchema,
  input: unknown,
): ParseResult<typeof releasePackageSchema._output> {
  const fieldResult = schema.safeParse(input);
  if (!fieldResult.success) {
    return { success: false, issues: formatIssues(fieldResult.error.issues) };
  }
  try {
    validateReleasePackageRelations(fieldResult.data);
  } catch (error) {
    if (error instanceof DomainValidationError) {
      return { success: false, issues: [...error.issues] };
    }
    throw error;
  }
  return { success: true, value: fieldResult.data };
}

export { DomainValidationError, formatIssues } from "./domain.js";
