import { useCallback, useContext, useEffect, useState } from "react";

import { BigNumber } from "ethers";
import { Nft } from "../../graph/classes";
import { CurrentAddressWrapper } from "../../CurrentAddressWrapper";
import createCancellablePromise from "../../create-cancellable-promise";
import usePoller from "../../../hooks/usePoller";
import UserContext from "../../UserProvider";
import { ContractContext } from "../../ContractsProvider";

const BigNumZero = BigNumber.from("0");

function range(start: number, stop: number, step: number) {
  const a = [start];
  let b = start;
  while (b < stop) {
    a.push((b += step || 1));
  }
  return a;
}

export const useFetchNftDev = (): { devNfts: Nft[]; isLoading: boolean } => {
  const currentAddress = useContext(CurrentAddressWrapper);
  const {E721, E721B, E1155, E1155B}  = useContext(ContractContext)

  const { signer } = useContext(UserContext);
  const [devNfts, setDevNfts] = useState<Nft[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchAsync = useCallback(async () => {
    if (typeof process.env.REACT_APP_FETCH_NFTS_DEV === "undefined") {
      if (isLoading) setIsLoading(false);
      return;
    }
    if (!E1155 || !E721 || !E721B || !E1155B || !signer || !currentAddress)
      return [];

    const usersNfts: Nft[] = [];
    const E1155IDs = range(0, 1005, 1);

    const num721s = await E721
      .balanceOf(currentAddress)
      .catch(() => BigNumZero);

    const num721bs = await E721B
      .balanceOf(currentAddress)
      .catch(() => BigNumZero);

    const num1155s = await E1155
      .balanceOfBatch(Array(E1155IDs.length).fill(currentAddress), E1155IDs)
      .catch(() => []);

    const num1155bs = await E1155B
      .balanceOfBatch(Array(E1155IDs.length).fill(currentAddress), E1155IDs)
      .catch(() => []);

    for (let i = 0; i < num721s.toNumber(); i++) {
      try {
        const tokenId = await E721.tokenOfOwnerByIndex(
          currentAddress,
          String(i)
        );
        usersNfts.push(new Nft(E721.address, tokenId, "1", true, signer));
      } catch (e) {
        console.debug(
          "most likely tokenOfOwnerByIndex does not work. whatever, this is not important"
        );
      }
    }

    for (let i = 0; i < num721bs.toNumber(); i++) {
      try {
        const tokenId = await E721B.tokenOfOwnerByIndex(
          currentAddress,
          String(i)
        );
        usersNfts.push(new Nft(E721B.address, tokenId, "1", true, signer));
      } catch (e) {
        console.debug(
          "most likely tokenOfOwnerByIndex does not work. whatever, this is not important"
        );
      }
    }

    let amountBalance = await E1155.balanceOfBatch(
      Array(E1155IDs.length).fill(currentAddress),
      E1155IDs
    );

    for (let i = 0; i < num1155s.length; i++) {
      if (amountBalance[i].toNumber() > 0) {
        usersNfts.push(
          new Nft(
            E1155.address,
            E1155IDs[i].toString(),
            amountBalance[i],
            false,
            signer
          )
        );
      }
    }

    amountBalance = await E1155B.balanceOfBatch(
      Array(E1155IDs.length).fill(currentAddress),
      E1155IDs
    );

    for (let i = 0; i < num1155bs.length; i++) {
      if (amountBalance[i].toNumber() > 0) {
        usersNfts.push(
          new Nft(
            E1155B.address,
            E1155IDs[i].toString(),
            amountBalance[i],
            false,
            signer
          )
        );
      }
    }
    if (usersNfts.length > 1) {
      setDevNfts(usersNfts);
    }
    setIsLoading(false);
  }, [E1155, E721, E721B, E1155B, signer, currentAddress, isLoading]);

  useEffect(() => {
    const fetchRequest = createCancellablePromise(fetchAsync());
    return fetchRequest.cancel;
  }, [fetchAsync]);

  usePoller(() => {
    const fetchRequest = createCancellablePromise(fetchAsync());
    return fetchRequest.cancel;
  }, 3000);

  return { devNfts, isLoading };
};
