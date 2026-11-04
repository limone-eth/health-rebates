// Reads from NEAR testnet with fetch only, so the read-only web app needs no npm install.
export const RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
export const EXPLORER = "https://testnet.nearblocks.io/txns";

export async function view(contractId, method, args = {}) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "view",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
  });
  if (!res.ok) throw new Error(`view ${method}: HTTP ${res.status}`);
  const { result, error } = await res.json();
  if (error || result?.error) throw new Error(`view ${method}: ${JSON.stringify(error ?? result.error)}`);
  return JSON.parse(Buffer.from(result.result).toString());
}
