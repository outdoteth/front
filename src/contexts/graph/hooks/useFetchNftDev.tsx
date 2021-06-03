import { useContext, useEffect, useState } from "react";

import { BigNumber } from "ethers";
import { IS_PROD } from "../../../consts";
import { Nft } from "../../graph/classes";
import { CurrentAddressWrapper } from "../../CurrentAddressWrapper";
import {
  E1155Context,
  E721Context,
  E1155BContext,
  E721BContext,
  SignerContext,
} from "../../../hardhat/SymfoniContext";

const BigNumZero = BigNumber.from("0");

function range(start: number, stop: number, step: number) {
  const a = [start];
  let b = start;
  while (b < stop) {
    a.push((b += step || 1));
  }
  return a;
}

export const useFetchNftDev = (): Nft[] => {
  const currentAddress = useContext(CurrentAddressWrapper);
  const { instance: e721 } = useContext(E721Context);
  const { instance: e1155 } = useContext(E1155Context);
  const { instance: e721b } = useContext(E721BContext);
  const { instance: e1155b } = useContext(E1155BContext);
  const [signer] = useContext(SignerContext);
  const [devNfts, setDevNfts] = useState<Nft[]>([]);

  useEffect(() => {
    const fetchAsync = async () => {
      if (IS_PROD) return;
      if (!e1155 || !e721 || !e721b || !e1155b || !signer || !currentAddress)
        return [];

      const usersNfts: Nft[] = [];
      const e1155IDs = range(0, 1005, 1);

      const num721s = await e721
        .balanceOf(currentAddress)
        .catch(() => BigNumZero);

      const num721bs = await e721b
        .balanceOf(currentAddress)
        .catch(() => BigNumZero);

      const num1155s = await e1155
        .balanceOfBatch(Array(e1155IDs.length).fill(currentAddress), e1155IDs)
        .catch(() => []);

      const num1155bs = await e1155b
        .balanceOfBatch(Array(e1155IDs.length).fill(currentAddress), e1155IDs)
        .catch(() => []);

      for (let i = 0; i < num721s.toNumber(); i++) {
        try {
          const tokenId = await e721.tokenOfOwnerByIndex(
            currentAddress,
            String(i)
          );
          usersNfts.push(new Nft(e721.address, tokenId, "1", true, signer));
        } catch (e) {
          console.debug(
            "most likely tokenOfOwnerByIndex does not work. whatever, this is not important"
          );
        }
      }

      for (let i = 0; i < num721bs.toNumber(); i++) {
        try {
          const tokenId = await e721b.tokenOfOwnerByIndex(
            currentAddress,
            String(i)
          );
          usersNfts.push(new Nft(e721b.address, tokenId, "1", true, signer));
        } catch (e) {
          console.debug(
            "most likely tokenOfOwnerByIndex does not work. whatever, this is not important"
          );
        }
      }

      let amountBalance = await e1155.balanceOfBatch(
        Array(e1155IDs.length).fill(currentAddress),
        e1155IDs
      );

      for (let i = 0; i < num1155s.length; i++) {
        if (amountBalance[i].toNumber() > 0) {
          usersNfts.push(
            new Nft(
              e1155.address,
              e1155IDs[i].toString(),
              amountBalance[i],
              false,
              signer
            )
          );
        }
      }

      amountBalance = await e1155b.balanceOfBatch(
        Array(e1155IDs.length).fill(currentAddress),
        e1155IDs
      );

      for (let i = 0; i < num1155s.length; i++) {
        if (amountBalance[i].toNumber() > 0) {
          usersNfts.push(
            new Nft(
              e1155b.address,
              e1155IDs[i].toString(),
              amountBalance[i],
              false,
              signer
            )
          );
        }
      }

      setDevNfts(usersNfts);
    };
    fetchAsync();
  }, [currentAddress, e721, e1155, signer]);

  return devNfts;
};
