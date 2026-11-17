export const isAddress = (s) => /^0x[0-9a-fA-F]{40}$/.test(String(s || "").trim());

export async function connectWallet(address, accountId) {
  const { saved } = await import("../live/sync");
  const { connect, syncPlatform } = await import("../live/import/connect");
  await saved();
  await connect("hyperliquid", { address: address.trim(), accountId });
  await syncPlatform("hyperliquid");
  return true;
}
