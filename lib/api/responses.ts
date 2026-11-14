import { NextResponse } from "next/server";
import { z } from "zod";

const uuidSchema = z.string().uuid();

export function isValidUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
) {
  const errorBody: ApiErrorPayload = fields ? { code, message, fields } : { code, message };
  return NextResponse.json({ error: errorBody }, { status });
}
