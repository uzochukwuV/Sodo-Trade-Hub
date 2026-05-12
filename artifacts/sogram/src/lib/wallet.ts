declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

export class WalletError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "WalletError";
  }
}

export function hasWallet(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

export async function connectWallet(): Promise<string> {
  if (!hasWallet()) {
    throw new WalletError("No wallet detected. Install MetaMask or another EVM wallet.", "no_wallet");
  }
  const accounts = (await window.ethereum!.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts || accounts.length === 0) {
    throw new WalletError("No accounts returned by wallet.", "no_accounts");
  }
  return accounts[0];
}

async function personalSign(message: string, address: string): Promise<string> {
  const signature = (await window.ethereum!.request({
    method: "personal_sign",
    params: [message, address],
  })) as string;
  return signature;
}

export type AuthedUser = {
  id: number;
  walletAddress: string;
  displayName: string | null;
  avatarUrl?: string | null;
  traderId?: number | null;
  joinedAt?: string;
  lastSeenAt?: string;
};

async function jpost(path: string, body: unknown) {
  const r = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    throw new WalletError(msg, "api_error");
  }
  return r.json();
}

/** Full SIWE round-trip: connect → nonce → sign → verify. Returns the authed user. */
export async function signInWithEthereum(): Promise<AuthedUser> {
  const address = await connectWallet();
  const { message } = await jpost("/api/auth/nonce", { address });
  const signature = await personalSign(message, address);
  const user = await jpost("/api/auth/verify", { address, message, signature });
  return user as AuthedUser;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}
