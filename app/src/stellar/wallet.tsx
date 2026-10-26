// Wallet: Freighter, or (behind ?demo) a testnet-only burner key kept in this browser.
// The burner exists so the demo can run without an extension and so the full flow can
// be tested headless; it is labelled everywhere it appears.
import { getAddress, getNetworkDetails, isAllowed, isConnected, requestAccess, signMessage, signTransaction, WatchWalletChanges } from "@stellar/freighter-api";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEMO, NET } from "../config";
import type { Signer } from "./client";

export type WalletKind = "freighter" | "burner";

export interface WalletState {
  kind: WalletKind | null;
  address: string | null;
  /** Network the wallet is on (Freighter can be on mainnet or futurenet). */
  networkName: string | null;
  wrongNetwork: boolean;
  status: "idle" | "connecting" | "connected" | "error";
  error: string | null;
  freighterInstalled: boolean | null;
  signer: Signer | null;
  connect: (kind: WalletKind) => Promise<void>;
  disconnect: () => void;
}

const KIND_KEY = "fathom:wallet";
const BURNER_KEY = "fathom:burner-secret";
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

function burnerKeypair(): Keypair {
  const existing = store.get(BURNER_KEY);
  if (existing) return Keypair.fromSecret(existing);
  const kp = Keypair.random();
  store.set(BURNER_KEY, kp.secret());
  return kp;
}

function burnerSigner(kp: Keypair): Signer {
  return {
    address: kp.publicKey(),
    signTransaction: async (xdr: string) => {
      const tx = TransactionBuilder.fromXDR(xdr, NET.passphrase);
      tx.sign(kp);
      return { signedTxXdr: tx.toXDR(), signerAddress: kp.publicKey() };
    },
    // SEP-53: ed25519 over sha256("Stellar Signed Message:\n" + message), what Freighter signs.
    signMessage: async (message: string) => {
      const prefixed = new TextEncoder().encode(`Stellar Signed Message:\n${message}`);
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", prefixed));
      return new Uint8Array(kp.sign(digest as never));
    },
  };
}

function freighterSigner(address: string): Signer {
  return {
    address,
    signTransaction: async (xdr, opts) => {
      const r = await signTransaction(xdr, { networkPassphrase: opts?.networkPassphrase ?? NET.passphrase, address });
      if (r.error) throw new Error(`Freighter: ${r.error.message ?? String(r.error)}`);
      return { signedTxXdr: r.signedTxXdr, signerAddress: r.signerAddress };
    },
    signMessage: async (message: string) => {
      const r = await signMessage(message, { networkPassphrase: NET.passphrase, address });
      if (r.error || !r.signedMessage) throw new Error(`Freighter: ${r.error?.message ?? "message not signed"}`);
      const sig = r.signedMessage;
      return typeof sig === "string" ? Uint8Array.from(atob(sig), (c) => c.charCodeAt(0)) : new Uint8Array(sig);
    },
  };
}

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [kind, setKind] = useState<WalletKind | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<{ name: string; passphrase: string } | null>(null);
  const [status, setStatus] = useState<WalletState["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    isConnected().then((r) => setInstalled(!!r.isConnected)).catch(() => setInstalled(false));
  }, []);

  const connect = useCallback(async (k: WalletKind) => {
    setStatus("connecting");
    setError(null);
    try {
      if (k === "burner") {
        if (!DEMO) throw new Error("The demo wallet is only available with ?demo");
        setAddress(burnerKeypair().publicKey());
        setNetwork({ name: "TESTNET", passphrase: NET.passphrase });
      } else {
        const inst = await isConnected();
        if (!inst.isConnected) throw new Error("Freighter is not installed. Get it at freighter.app, then reload.");
        const access = await requestAccess();
        if (access.error) throw new Error(access.error.message ?? "Freighter refused access");
        const net = await getNetworkDetails();
        setAddress(access.address);
        setNetwork({ name: net.network, passphrase: net.networkPassphrase });
      }
      setKind(k);
      store.set(KIND_KEY, k);
      setStatus("connected");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const disconnect = useCallback(() => {
    store.del(KIND_KEY);
    setKind(null);
    setAddress(null);
    setNetwork(null);
    setStatus("idle");
  }, []);

  // Reconnect silently after a reload.
  useEffect(() => {
    const k = store.get(KIND_KEY) as WalletKind | null;
    if (k === "burner" && DEMO) void connect("burner");
    if (k === "freighter") {
      isAllowed().then(async (a) => {
        if (!a.isAllowed) return;
        const [addr, net] = await Promise.all([getAddress(), getNetworkDetails()]);
        if (addr.address) {
          setAddress(addr.address);
          setNetwork({ name: net.network, passphrase: net.networkPassphrase });
          setKind("freighter");
          setStatus("connected");
        }
      }).catch(() => {});
    }
  }, [connect]);

  // Follow account and network switches made in Freighter.
  useEffect(() => {
    if (kind !== "freighter") return;
    const w = new WatchWalletChanges(2000);
    w.watch(({ address: a, network: n, networkPassphrase: p }) => {
      if (a) setAddress(a);
      if (p) setNetwork({ name: n, passphrase: p });
    });
    return () => w.stop();
  }, [kind]);

  const value = useMemo<WalletState>(() => {
    const wrongNetwork = !!network && network.passphrase !== NET.passphrase;
    const signer = address && kind ? (kind === "burner" ? burnerSigner(burnerKeypair()) : freighterSigner(address)) : null;
    return { kind, address, networkName: network?.name ?? null, wrongNetwork, status, error, freighterInstalled: installed, signer, connect, disconnect };
  }, [kind, address, network, status, error, installed, connect, disconnect]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}
