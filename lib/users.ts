import bcrypt from "bcryptjs";
import { query } from "@/lib/db";

export type UserRole = "admin" | "accounts" | "assembly";
export type UserStatus = "pending" | "approved" | "rejected" | "disabled";

export type User = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
};

export type NewUser = {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
};

/** Error thrown when an email already has an account. */
export class EmailInUseError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "EmailInUseError";
  }
}

const PUBLIC_COLUMNS =
  "id, full_name, email, role, status, created_at, updated_at";

/**
 * Create a new user in 'pending' status (the "Request Access" flow).
 * Throws EmailInUseError if the email is already taken.
 */
export async function createPendingUser(input: NewUser): Promise<User> {
  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    const result = await query<User>(
      `INSERT INTO users (full_name, email, password_hash, role, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING ${PUBLIC_COLUMNS}`,
      [input.fullName.trim(), input.email.trim(), passwordHash, input.role]
    );
    return result.rows[0];
  } catch (error) {
    // 23505 = unique_violation (case-insensitive email index)
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new EmailInUseError();
    }
    throw error;
  }
}

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; reason: "invalid" | "pending" | "rejected" | "disabled" };

/**
 * Verify an email + password against the DB.
 * Returns the (public) user only when credentials match AND the account is
 * approved; otherwise reports why so the UI can show the right message.
 */
export async function verifyCredentials(
  email: string,
  password: string
): Promise<AuthResult> {
  const result = await query<User & { password_hash: string }>(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [email.trim()]
  );

  const row = result.rows[0];
  // Compare even when no row is found to avoid leaking which emails exist.
  const hash = row?.password_hash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinv";
  const passwordMatches = await bcrypt.compare(password, hash);

  if (!row || !passwordMatches) return { ok: false, reason: "invalid" };
  if (row.status !== "approved") return { ok: false, reason: row.status };

  const { password_hash: _hash, ...user } = row;
  return { ok: true, user };
}

/** Fetch a single user by id, or null if not found. */
export async function getUserById(id: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] ?? null;
}

/** List users with the given status, newest first. */
export async function listUsersByStatus(status: UserStatus): Promise<User[]> {
  const result = await query<User>(
    `SELECT ${PUBLIC_COLUMNS} FROM users
     WHERE status = $1
     ORDER BY created_at DESC`,
    [status]
  );
  return result.rows;
}

/** Count of pending access requests. */
export async function countPending(): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT count(*) AS count FROM users WHERE status = 'pending'`
  );
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * Set a user's status. Only ever transitions non-admin access requests, so
 * admin rows can never be locked out through the panel.
 */
export async function setUserStatus(
  id: string,
  status: UserStatus
): Promise<void> {
  await query(
    `UPDATE users SET status = $2
     WHERE id = $1 AND role <> 'admin'`,
    [id, status]
  );
}
