import React, { createContext, useContext, useState, useCallback } from "react";
import { request } from "graphql-request";
import { hasPath } from "ramda";

import {
  CurrentAddressContext,
  RentNftContext,
  SignerContext,
} from "../../hardhat/SymfoniContext";
import { getERC1155, getERC721, THROWS, timeItAsync } from "../../utils";
import { usePoller } from "../../hooks/usePoller";
import { SECOND_IN_MILLISECONDS } from "../../consts";

import { Address } from "../../types";
import {
  queryUserRenft,
  queryAllRenft,
  queryMyERC721s,
  queryMyERC1155s,
} from "./queries";
import { Lending, User, ERC1155s, ERC721s, ERCNft } from "./types";
import { parseLending } from "./utils";
// * only in dev env
import useFetchNftDev from "./hooks/useFetchNftDev";

/**
 * Useful links
 * https://api.thegraph.com/subgraphs/name/wighawag/eip721-subgraph
 * https://api.thegraph.com/subgraphs/name/amxx/eip1155-subgraph
 * https://github.com/0xsequence/token-directory
 *
 * Kudos to
 * Luis: https://github.com/microchipgnu
 * Solidity God: wighawag
 */

const IS_PROD =
  process.env["REACT_APP_ENVIRONMENT"]?.toLowerCase() === "production";

// renft localhost and prod subgraph for pulling NFTs related to reNFT
const ENDPOINT_RENFT_PROD =
  "https://api.thegraph.com/subgraphs/name/nazariyv/rentnft";
const ENDPOINT_RENFT_DEV =
  "http://localhost:8000/subgraphs/name/nazariyv/ReNFT";

// non-reNFT prod subgraphs for pulling your NFT balances
const ENDPOINT_EIP721_PROD =
  "https://api.thegraph.com/subgraphs/name/wighawag/eip721-subgraph";
const ENDPOINT_EIP1155_PROD =
  "https://api.thegraph.com/subgraphs/name/amxx/eip1155-subgraph";

// differently arranged (for efficiency) Nft
// '0x123...456': { tokens: { '1': ..., '2': ... } }
type Nfts = {
  // nft address
  [key: string]: {
    contract: ERCNft["contract"];
    // * if there is ever a new type of NFT
    // * this boolean flag will be invalid, update enum FetchType then as well
    isERC721: ERCNft["isERC721"];
    tokens: {
      // tokenId
      [key: string]: {
        // multiple lending and renting ids, because the same
        // nft can be re-lent / re-rented multiple times
        lending?: ERCNft["lending"];
        renting?: ERCNft["renting"];
        tokenURI?: ERCNft["tokenURI"];
        meta?: ERCNft["meta"];
      };
    };
  };
};

// AddressToNft's LendingId is the key of this type
// convenience 1-1 map between lendingId and AddressToNft
type LendingById = {
  // mapping (lendingId => nft address and tokenId)
  [key: string]: {
    address: Address;
    tokenId: string;
  };
};
type RentingById = LendingById;

type GraphContextType = {
  nfts: Nfts;
  lendingById: LendingById;
  rentingById: RentingById;
  user: User;
  fetchMyNfts: () => void;
  removeLending: (nfts: ERCNft[]) => void;
};

type Token = {
  address: ERCNft["address"];
  tokenId: ERCNft["tokenId"];
  tokenURI?: ERCNft["tokenURI"];
};

const DefaultGraphContext: GraphContextType = {
  nfts: {},
  lendingById: {},
  rentingById: {},
  user: {
    address: "",
  },
  removeLending: THROWS,
  fetchMyNfts: THROWS,
};

enum FetchType {
  ERC721,
  ERC1155,
}

const GraphContext = createContext<GraphContextType>(DefaultGraphContext);

export const GraphProvider: React.FC = ({ children }) => {
  const [currentAddress] = useContext(CurrentAddressContext);
  const [signer] = useContext(SignerContext);
  const { instance: renft } = useContext(RentNftContext);

  const [nfts, setNfts] = useState<Nfts>(DefaultGraphContext["nfts"]);
  const [user, setUser] = useState<User>(DefaultGraphContext["user"]);
  const [lendingById, setLendingById] = useState<LendingById>(
    DefaultGraphContext["lendingById"]
  );
  const [rentingById, setRentingById] = useState<RentingById>(
    DefaultGraphContext["rentingById"]
  );

  const fetchNftDev = useFetchNftDev();

  const _setTokenId = (token: Token) => {
    if (hasPath([token.address, "tokenIds", token.tokenId])(nfts)) return;

    setNfts((prev) => ({
      ...prev,
      [token.address]: {
        ...prev[token.address],
        tokens: {
          ...prev[token.address].tokens,
          [token.tokenId]: {
            tokenURI: token.tokenURI,
          },
        },
      },
    }));
  };

  const _setContract = async (token: Token, isERC721: boolean) => {
    if (nfts[token.address].contract) return;

    const contract = isERC721
      ? getERC721(token.address, signer)
      : getERC1155(token.address, signer);
    const isApprovedForAll = await contract
      .isApprovedForAll(currentAddress, renft?.address ?? "")
      .catch(() => false);

    setNfts((prev) => ({
      ...prev,
      [token.address]: {
        ...prev[token.address],
        contract,
        isApprovedForAll,
        isERC721,
        tokens: {
          ...prev[token.address].tokens,
          [token.tokenId]: {
            tokenURI: token.tokenURI,
          },
        },
      },
    }));
  };

  // * uses the eip1155 subgraph to pull all your erc1155 holdings
  // * uses the eip721  subgraph to pull all your erc721  holdings
  /**
   * Fetches ALL the NFTs that the user owns.
   * The ones that the user has lent, won't show here obviously,
   * because they are in reNFT's escrow.
   * The ones that the user is renting, will show here, because
   * they now own those NFTs.
   */
  const fetchAllERCs = useCallback(
    async (fetchType: FetchType) => {
      let query = "";
      let subgraphURI = "";

      switch (fetchType) {
        case FetchType.ERC721:
          query = queryMyERC721s(currentAddress);
          subgraphURI = ENDPOINT_EIP721_PROD;
          break;
        case FetchType.ERC1155:
          query = queryMyERC1155s(currentAddress);
          subgraphURI = ENDPOINT_EIP1155_PROD;
          break;
      }

      const response: ERC721s | ERC1155s = await timeItAsync(
        `Pulled My ${FetchType[fetchType]} NFTs`,
        async () => await request(subgraphURI, query)
      );
      console.log(response);

      let tokens: Token[] = [];
      switch (fetchType) {
        case FetchType.ERC721:
          tokens = (response as ERC721s).tokens.map((t) => {
            // ! in the case of ERC721 the raw tokenId is in fact `${nftAddress}_${tokenId}`
            const [address, tokenId] = t.id.split("_");
            return { address, tokenId, tokenURI: t.tokenURI };
          });
          break;
        case FetchType.ERC1155:
          tokens = (response as ERC1155s).account.balances.map((b) => ({
            address: b.token.registry.contractAddress,
            tokenId: b.token.tokenId,
            tokenURI: b.token.tokenURI,
          }));
          break;
      }

      for (const token of tokens) {
        // ? await in loop is safe?
        await _setContract(token, fetchType === FetchType.ERC721);
        _setTokenId(token);
      }
    },
    // ! do not add nfts as a dep, will cause infinite loop
    /* eslint-disable-next-line */
    [currentAddress, renft?.address, signer]
  );

  const fetchUser = useCallback(async () => {
    const query = queryUserRenft(currentAddress);
    const data: {
      user: User;
    } = await request(
      // TODO
      ENDPOINT_RENFT_DEV,
      // IS_PROD ? ENDPOINT_RENFT_PROD : ENDPOINT_RENFT_DEV,
      query
    );
    if (!data?.user) return [];

    const { lending, renting } = data.user;
    // todo: only ids are of interest here
    setUser({
      address: currentAddress,
      lending: lending || [],
      renting: renting || [],
    });
  }, [currentAddress]);

  // these are all the NFTs that are available for rent
  const fetchAllLendingAndRenting = useCallback(async () => {
    const query = queryAllRenft();
    const { nfts } = await request(
      ENDPOINT_RENFT_DEV,
      // todo
      // IS_PROD ? ENDPOINT_RENFT_PROD : ENDPOINT_RENFT_DEV,
      query
    );
    if (!nfts) return [];

    for (let i = 0; i < nfts.length; i++) {
      const numTimesLent = nfts[i].lending.length;
      const numTimesRented = nfts[i].renting?.length ?? 0;
      // each Nft has an array of lending and renting, only the last
      // item in each one is the source of truth when it comes to
      // ability to lend or rent
      const isAvailableForRent = numTimesLent === numTimesRented + 1;
    }
  }, []);

  const fetchRenting = useCallback(async () => {
    true;
  }, []);

  const fetchMyNfts = useCallback(async () => {
    if (IS_PROD) {
      fetchAllERCs(FetchType.ERC721);
      fetchAllERCs(FetchType.ERC1155);
    } else {
      fetchNftDev();
    }
  }, [fetchAllERCs, fetchNftDev]);

  usePoller(fetchMyNfts, 30 * SECOND_IN_MILLISECONDS); // all of my NFTs (unrelated or related to ReNFT)
  usePoller(fetchAllLendingAndRenting, 9 * SECOND_IN_MILLISECONDS); // all of the lent NFTs on ReNFT
  usePoller(fetchRenting, 8 * SECOND_IN_MILLISECONDS); // all of the rented NFTs on ReNFT
  usePoller(fetchUser, 7 * SECOND_IN_MILLISECONDS); // all of my NFTs (related to ReNFT)

  return (
    <GraphContext.Provider
      value={{
        nfts,
        fetchMyNfts,
        removeLending: () => {
          true;
        },
        user,
        lendingById,
        rentingById,
      }}
    >
      {children}
    </GraphContext.Provider>
  );
};

export default GraphContext;
