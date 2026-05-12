import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { signInWithEthereum, logout, type AuthedUser } from "@/lib/wallet";

export const ME_QUERY_KEY = ["auth", "me"] as const;

async function fetchMe(): Promise<AuthedUser | null> {
  const r = await fetch("/api/auth/me", { credentials: "include" });
  if (r.status === 401) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export function useMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMe,
    staleTime: 60_000,
    retry: false,
  });
}

export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: signInWithEthereum,
    onSuccess: (user) => {
      qc.setQueryData(ME_QUERY_KEY, user);
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      qc.setQueryData(ME_QUERY_KEY, null);
    },
  });
}

/**
 * Convenience accessor — the integer user ID to use in payloads
 * that previously used the `MY_*_ID = 37` placeholder.
 * Falls back to traderId (linked Sodex trader) if present, else the user's own id.
 */
export function useMyId(): number | null {
  const { data } = useMe();
  if (!data) return null;
  return data.traderId ?? data.id;
}
