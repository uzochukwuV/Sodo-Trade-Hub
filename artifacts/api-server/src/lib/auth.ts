import { verifyMessage, isAddress, getAddress } from "viem";
import { randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable, tradersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    walletAddress?: string;
  }
}

export const NONCE_TTL_MS = 10 * 60_000; // 10 minutes
const SIWE_DOMAIN = process.env["SIWE_DOMAIN"] ?? "sogram.app";
const SIWE_STATEMENT = "Sign in to Sogram. This signature does not authorize any transaction or transfer.";

export function newNonce(): string {
  return randomBytes(16).toString("hex");
}

export function buildSiweMessage(opts: {
  address: string;
  nonce: string;
  issuedAt: Date;
  domain?: string;
  uri?: string;
  chainId?: number;
}): string {
  const domain = opts.domain ?? SIWE_DOMAIN;
  const uri = opts.uri ?? `https://${domain}`;
  const chainId = opts.chainId ?? 1;
  // EIP-4361 message
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    opts.address,
    "",
    SIWE_STATEMENT,
    "",
    `URI: ${uri}`,
    `Version: 1`,
    `Chain ID: ${chainId}`,
    `Nonce: ${opts.nonce}`,
    `Issued At: ${opts.issuedAt.toISOString()}`,
  ].join("\n");
}

/**
 * Strict EIP-4361 (SIWE) message parser. Returns null if any required field is
 * missing or malformed. We don't accept non-canonical messages — the message MUST
 * match the canonical form produced by `buildSiweMessage` exactly in structure.
 *
 * Reference: https://eips.ethereum.org/EIPS/eip-4361
 */
export type ParsedSiwe = {
  domain: string;
  address: string;     // checksummed
  statement: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: Date;
};

export function parseSiwe(message: string): ParsedSiwe | null {
  const lines = message.split("\n");
  // Canonical layout (10 lines):
  //  0: "<domain> wants you to sign in with your Ethereum account:"
  //  1: address
  //  2: ""  (blank)
  //  3: statement
  //  4: ""  (blank)
  //  5: "URI: ..."
  //  6: "Version: ..."
  //  7: "Chain ID: ..."
  //  8: "Nonce: ..."
  //  9: "Issued At: ..."
  if (lines.length < 10) return null;

  const headerMatch = /^(.+?) wants you to sign in with your Ethereum account:$/.exec(lines[0]!);
  if (!headerMatch) return null;
  const domain = headerMatch[1]!.trim();

  const address = lines[1]!.trim();
  if (!isAddress(address)) return null;

  if (lines[2] !== "") return null;
  const statement = lines[3]!;
  if (lines[4] !== "") return null;

  const fieldOf = (line: string, prefix: string) => line.startsWith(prefix) ? line.slice(prefix.length).trim() : null;
  const uri      = fieldOf(lines[5]!, "URI: ");
  const version  = fieldOf(lines[6]!, "Version: ");
  const chainStr = fieldOf(lines[7]!, "Chain ID: ");
  const nonce    = fieldOf(lines[8]!, "Nonce: ");
  const issuedStr = fieldOf(lines[9]!, "Issued At: ");
  if (!uri || !version || !chainStr || !nonce || !issuedStr) return null;
  const chainId = parseInt(chainStr, 10);
  if (!Number.isFinite(chainId) || chainId <= 0) return null;
  const issuedAt = new Date(issuedStr);
  if (isNaN(issuedAt.getTime())) return null;
  if (!/^[a-zA-Z0-9]{8,}$/.test(nonce)) return null;

  return { domain, address: getAddress(address), statement, uri, version, chainId, nonce, issuedAt };
}

/**
 * Verify a SIWE signature against the stored nonce for an address. Strict EIP-4361
 * compliance — message must parse to the canonical form AND match expected nonce,
 * domain, statement, version. Returns the checksummed address on success, or null.
 *
 * NOTE: This function does NOT burn the nonce. The caller MUST consume the nonce
 * atomically (conditional UPDATE) to prevent TOCTOU replay under concurrency.
 */
export async function verifySiwe(opts: {
  address: string;
  message: string;
  signature: `0x${string}`;
  expectedNonce: string;
  nonceIssuedAt: Date;
}): Promise<string | null> {
  if (!isAddress(opts.address)) return null;
  if (Date.now() - opts.nonceIssuedAt.getTime() > NONCE_TTL_MS) return null;

  const parsed = parseSiwe(opts.message);
  if (!parsed) return null;
  if (parsed.nonce !== opts.expectedNonce) return null;
  if (parsed.statement !== SIWE_STATEMENT) return null;
  if (parsed.version !== "1") return null;
  if (parsed.domain !== SIWE_DOMAIN) return null;
  if (parsed.address.toLowerCase() !== getAddress(opts.address).toLowerCase()) return null;

  try {
    const ok = await verifyMessage({
      address: parsed.address as `0x${string}`,
      message: opts.message,
      signature: opts.signature,
    });
    return ok ? parsed.address : null;
  } catch (err) {
    logger.warn({ err, address: opts.address }, "siwe.verify_failed");
    return null;
  }
}

/** Express middleware — 401 if no session user, otherwise attaches `req.user`. */
export function requireAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: "auth_required" });
      return;
    }
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!u || u.isBanned) {
      res.status(401).json({ error: "auth_invalid" });
      return;
    }
    (req as Request & { user: typeof u }).user = u;
    next();
  };
}

export function getCurrentUser(req: Request) {
  return (req as Request & { user?: typeof usersTable.$inferSelect }).user;
}

/**
 * Express middleware — same as `requireAuth()` but additionally requires the
 * authenticated user be linked to a tracked `traders` row. Performs a lazy link
 * by wallet address if missing. Sets `req.user.traderId` on success.
 * 403 if no trader row matches the wallet.
 */
export function requireTrader() {
  const auth = requireAuth();
  return async (req: Request, res: Response, next: NextFunction) => {
    auth(req, res, async () => {
      const u = getCurrentUser(req);
      if (!u) { res.status(401).json({ error: "auth_required" }); return; }
      if (!u.traderId) {
        const [t] = await db.select().from(tradersTable).where(eq(tradersTable.walletAddress, u.walletAddress)).limit(1);
        if (t) {
          await db.update(usersTable).set({ traderId: t.id }).where(eq(usersTable.id, u.id));
          (req as Request & { user: typeof usersTable.$inferSelect }).user = { ...u, traderId: t.id };
        } else {
          res.status(403).json({ error: "wallet_not_tracked", hint: "Your wallet is not in the tracked traders set yet. This action is reserved for tracked traders." });
          return;
        }
      }
      next();
    });
  };
}

/** Returns the trader id for the current request. Caller must have used `requireTrader()`. */
export function getCurrentTraderId(req: Request): number {
  const u = getCurrentUser(req);
  if (!u?.traderId) throw new Error("getCurrentTraderId called without requireTrader()");
  return u.traderId;
}
