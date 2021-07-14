import { BigNumber } from "ethers";
import { useCallback } from "react";
import { Lending } from "../contexts/graph/classes";
import { sortNfts } from "../utils";
import createDebugger from "debug";
import { useSDK } from "./useSDK";
import { useTransactionWrapper } from "./useTransactionWrapper";

const debug = createDebugger("app:contracts:useClaimColleteral");

export const useClaimColleteral = (): ((
  nfts: Lending[]
) => Promise<void | boolean>) => {
  const transactionWrapper = useTransactionWrapper();
  const sdk = useSDK();

  return useCallback(
    (nfts: Lending[]) => {
      if (!sdk) return Promise.reject();
      const sortedNfts = nfts.sort(sortNfts);
      const params: [string[], BigNumber[], BigNumber[]] = [
        sortedNfts.map((nft) => nft.address),
        sortedNfts.map((nft) => BigNumber.from(nft.tokenId)),
        sortedNfts.map((nft) => BigNumber.from(nft.renting?.lendingId))
      ];
      debug(
        "Claim modal addresses ",
        sortedNfts.map((nft) => nft.address)
      );
      debug(
        "Claim modal tokenId ",
        sortedNfts.map((nft) => nft.tokenId)
      );
      debug(
        "Claim modal lendingId ",
        sortedNfts.map((nft) => nft.renting?.lendingId)
      );
      return transactionWrapper(sdk.claimCollateral(...params));
    },
    [sdk]
  );
};
