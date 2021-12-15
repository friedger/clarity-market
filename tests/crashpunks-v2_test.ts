import {
  Clarinet,
  Tx,
  Chain,
  Account,
  types,
} from "https://deno.land/x/clarinet@v0.20.0/index.ts";
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.90.0/testing/asserts.ts";
import { formatBuffString, hexStringToArrayBuffer } from "../src/utils.ts";
import { CrashPunksV1Client } from "../src/crashpunks-v1-client.ts";
import { CrashPunksV2Client, ErrCode } from "../src/crashpunks-v2-client.ts";

const getWalletsAndClient = (
  chain: Chain,
  accounts: Map<string, Account>
): {
  administrator: Account;
  deployer: Account;
  wallet1: Account;
  wallet2: Account;
  wallet3: Account;
  wallet4: Account;
  wallet5: Account;
  newAdministrator: Account;
  clientV1: CrashPunksV1Client;
  clientV2: CrashPunksV2Client;
} => {
  const administrator = {
    address: "SP3N4AJFZZYC4BK99H53XP8KDGXFGQ2PRSQP2HGT6",
    balance: 1000000,
    name: "administrator",
    mnemonic: "asdf",
    derivation: "asdf",
  };
  const deployer = accounts.get("deployer")!;
  const wallet1 = accounts.get("wallet_1")!;
  const wallet2 = accounts.get("wallet_2")!;
  const wallet3 = accounts.get("wallet_3")!;
  const wallet4 = accounts.get("wallet_4")!;
  const wallet5 = accounts.get("wallet_5")!;
  const newAdministrator = accounts.get("wallet_6")!;
  const clientV1 = new CrashPunksV1Client(chain, deployer);
  const clientV2 = new CrashPunksV2Client(chain, deployer);
  return {
    administrator,
    deployer,
    wallet1,
    wallet2,
    wallet3,
    wallet4,
    wallet5,
    newAdministrator,
    clientV1,
    clientV2,
  };
};

const sig =
  "4e53f47a3583c00bc49b54bdaff0ca544c55d3a1872c87abe606e20264518744b9a0710ec247b208672850bf1c2f99b1712290cd414ba7737460394564b56cdd01";
const msg = "53f5924a377df35f12ad40630ca720496c4f9061c31469fef5789e17b09dfcd4";
const hsh = "4123b04d3e2bf6133bb5b36d7508f3d0099eced4a62174904f3f66a0fc2092d6";
const url =
  "https://gaia.blockstack.org/hub/1MNnYMskXjRmQU6m6sFMBe6a7xVdMvH9dp/to_the_machine_eternal/bob_jaroc/72ba02ef43182ddcb5ccb385b36001e4b41051d50e84d21435d494a732715181.json";

const setCollectionRoyalties = (
  chain: Chain,
  accounts: Map<string, Account>,
  client: "V1" | "V2"
) => {
  const {
    administrator,
    deployer,
    wallet1,
    wallet2,
    wallet3,
    wallet4,
    wallet5,
    newAdministrator,
    clientV1,
    clientV2,
  } = getWalletsAndClient(chain, accounts);

  const newMintAddresses = [
    wallet2.address,
    wallet3.address,
    wallet4.address,
    wallet5.address,
  ];
  const newMintShares = [5000000000, 4000000000, 2000000000, 1000000000];
  const newAddresses = [
    wallet2.address,
    wallet3.address,
    wallet4.address,
    wallet5.address,
    wallet2.address,
    wallet3.address,
    wallet4.address,
    wallet5.address,
    wallet2.address,
    wallet3.address,
  ];
  const newShares = [
    5000000000, 4000000000, 2000000000, 1000000000, 0, 0, 0, 0, 0, 0,
  ];
  const newSecondaries = [
    5000000000, 4000000000, 2000000000, 1000000000, 0, 0, 0, 0, 0, 0,
  ];

  // the testing for this is done in loopbomb_test
  let block = chain.mineBlock([
    client === "V1"
      ? clientV1.setCollectionRoyalties(
          newMintAddresses,
          newMintShares,
          newAddresses,
          newShares,
          newSecondaries,
          administrator.address
        )
      : clientV2.setCollectionRoyalties(
          newMintAddresses,
          newMintShares,
          newAddresses,
          newShares,
          administrator.address
        ),
  ]);
  block.receipts[0].result.expectOk().expectBool(true);
};

// mints a v1 token
const mintV1Token = (chain: Chain, accounts: Map<string, Account>) => {
  const { wallet1, clientV1 } = getWalletsAndClient(chain, accounts);

  setCollectionRoyalties(chain, accounts, "V1");

  // the testing for this is done in loopbomb_test
  chain.mineBlock([
    clientV1.collectionMintToken(
      hexStringToArrayBuffer(sig),
      hexStringToArrayBuffer(msg),
      hexStringToArrayBuffer(
        Array.from({ length: 64 })
          .map((_) => Math.floor(Math.random() * 10))
          .join("")
      ),
      url,
      1,
      0,
      100000000,
      200000000,
      wallet1.address
    ),
  ]);
};

Clarinet.test({
  name: "CrashpunksV2 - Ensure can upgrade v1 -> v2",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const {
      administrator,
      deployer,
      wallet1,
      wallet2,
      newAdministrator,
      clientV1,
      clientV2,
    } = getWalletsAndClient(chain, accounts);

    // mint v1 token
    mintV1Token(chain, accounts);

    // fail if not wallet1 tries to upgrade
    let block = chain.mineBlock([
      clientV2.upgradeV1ToV2(0, administrator.address),
    ]);
    block.receipts[0].result.expectErr().expectUint(ErrCode.ERR_NOT_V1_OWNER);

    block = chain.mineBlock([clientV2.upgradeV1ToV2(0, wallet1.address)]);

    block.receipts[0].result.expectOk().expectBool(true);

    // 1. Transfers v1 NFT to this contract
    block.receipts[0].events.expectNonFungibleTokenTransferEvent(
      types.uint(0),
      wallet1.address,
      `${deployer.address}.crashpunks-v2`,
      `${deployer.address}.crashpunks-v1`,
      "crashpunks"
    );

    // 2. Mints the v2 NFT with the same nftIndex
    block.receipts[0].events.expectNonFungibleTokenMintEvent(
      types.uint(0),
      wallet1.address,
      `${deployer.address}.crashpunks-v2`,
      "crashpunks-v2"
    );

    // 3. Burns the original v1 NFT
    block.receipts[0].events.expectNonFungibleTokenBurnEvent(
      types.uint(0),
      `${deployer.address}.crashpunks-v2`,
      `${deployer.address}.crashpunks-v1`,
      "crashpunks"
    );

    // ensure can batch upgrade
    // mint 10 more v1
    for (let i = 0; i < 10; i++) {
      mintV1Token(chain, accounts);
    }

    // upgrade another 10
    block = chain.mineBlock([
      clientV2.batchUpgradeV1ToV2(
        Array.from({ length: 10 }).map((_, index) => index + 1),
        wallet1.address
      ),
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // make sure wallet1 owns v2 nftid 10
    console.log(
      clientV2
        .getOwner(10)
        .result.expectOk()
        .expectSome()
        .expectPrincipal(wallet1.address)
    );
    // make sure none own v2 nft id 11
    clientV2.getOwner(11).result.expectOk().expectNone();
  },
});

Clarinet.test({
  name: "CrashpunksV2 - Ensure can list and unlist by owner",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const {
      administrator,
      deployer,
      wallet1,
      wallet2,
      newAdministrator,
      clientV2,
    } = getWalletsAndClient(chain, accounts);

    // mint v1 and upgrade
    mintV1Token(chain, accounts);
    chain.mineBlock([clientV2.upgradeV1ToV2(0, wallet1.address)]);

    // shouldn't be listed
    clientV2.getTokenMarketByIndex(0).result.expectNone();

    // list for 100 stx
    let block = chain.mineBlock([
      clientV2.listItem(0, 100000000, wallet1.address),
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // check is listed
    assertEquals(
      clientV2.getTokenMarketByIndex(0).result.expectSome().expectTuple(),
      { price: types.uint(100000000) }
    );

    // unlist
    block = chain.mineBlock([clientV2.unlistItem(0, wallet1.address)]);
    block.receipts[0].result.expectOk().expectBool(true);
    clientV2.getTokenMarketByIndex(0).result.expectNone();
  },
});

Clarinet.test({
  name: "CrashpunksV2 - Ensure can NFT be listed and bought",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const {
      administrator,
      deployer,
      wallet1,
      wallet2,
      wallet3,
      wallet4,
      wallet5,
      newAdministrator,
      clientV2,
    } = getWalletsAndClient(chain, accounts);

    // mint v1 and upgrade
    mintV1Token(chain, accounts);
    chain.mineBlock([clientV2.upgradeV1ToV2(0, wallet1.address)]);

    // shouldn't be listed
    clientV2.getTokenMarketByIndex(0).result.expectNone();

    // list for 100 stx
    let block = chain.mineBlock([
      clientV2.listItem(0, 100000000, wallet1.address),
    ]);
    block.receipts[0].result.expectOk().expectBool(true);
    assertEquals(
      clientV2.getTokenMarketByIndex(0).result.expectSome().expectTuple(),
      { price: types.uint(100000000) }
    );

    setCollectionRoyalties(chain, accounts, "V2");
    block = chain.mineBlock([clientV2.buyNow(0, wallet2.address)]);
    block.receipts[0].result.expectOk().expectBool(true);

    block.receipts[0].events.expectSTXTransferEvent(
      50000000,
      wallet2.address,
      wallet1.address
    );

    block.receipts[0].events.expectSTXTransferEvent(
      40000000,
      wallet2.address,
      wallet3.address
    );

    block.receipts[0].events.expectSTXTransferEvent(
      20000000,
      wallet2.address,
      wallet4.address
    );

    block.receipts[0].events.expectSTXTransferEvent(
      10000000,
      wallet2.address,
      wallet5.address
    );

    block.receipts[0].events.expectNonFungibleTokenTransferEvent(
      types.uint(0),
      wallet1.address,
      wallet2.address,
      `${deployer.address}.crashpunks-v2`,
      "crashpunks-v2"
    );
  },
});

Clarinet.test({
  name: "CrashpunksV2 - Ensure NFT can't be bought when unlisted",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const {
      administrator,
      deployer,
      wallet1,
      wallet2,
      newAdministrator,
      clientV2,
    } = getWalletsAndClient(chain, accounts);

    // mint v1 and upgrade
    mintV1Token(chain, accounts);
    chain.mineBlock([clientV2.upgradeV1ToV2(0, wallet1.address)]);

    // shouldn't be listed
    clientV2.getTokenMarketByIndex(0).result.expectNone();

    // list for 100 stx
    let block = chain.mineBlock([
      clientV2.listItem(0, 100000000, wallet1.address),
    ]);
    block.receipts[0].result.expectOk().expectBool(true);
    assertEquals(
      clientV2.getTokenMarketByIndex(0).result.expectSome().expectTuple(),
      { price: types.uint(100000000) }
    );

    // unlist
    block = chain.mineBlock([clientV2.unlistItem(0, wallet1.address)]);
    block.receipts[0].result.expectOk().expectBool(true);
    clientV2.getTokenMarketByIndex(0).result.expectNone();

    // wallet 2 trying to buy should fail
    block = chain.mineBlock([clientV2.buyNow(0, wallet2.address)]);
    block.receipts[0].result
      .expectErr()
      .expectUint(ErrCode.ERR_NFT_NOT_LISTED_FOR_SALE);
  },
});

Clarinet.test({
  name: "CrashpunksV2 - Ensure NFT can't be transferred when listed",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const {
      administrator,
      deployer,
      wallet1,
      wallet2,
      wallet3,
      newAdministrator,
      clientV2,
    } = getWalletsAndClient(chain, accounts);

    // mint v1 and upgrade
    mintV1Token(chain, accounts);
    chain.mineBlock([clientV2.upgradeV1ToV2(0, wallet1.address)]);

    // shouldn't be listed
    clientV2.getTokenMarketByIndex(0).result.expectNone();

    // list for 100 stx
    let block = chain.mineBlock([
      clientV2.listItem(0, 100000000, wallet1.address),
    ]);
    block.receipts[0].result.expectOk().expectBool(true);
    assertEquals(
      clientV2.getTokenMarketByIndex(0).result.expectSome().expectTuple(),
      { price: types.uint(100000000) }
    );

    // wallet 1 trying to transfer should fail
    block = chain.mineBlock([
      clientV2.transfer(0, wallet1.address, wallet2.address, wallet1.address),
    ]);
    block.receipts[0].result.expectErr().expectUint(ErrCode.ERR_NFT_LISTED);
  },
});

Clarinet.test({
  name: "CrashpunksV2 - ensure can mint v2",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const {
      administrator,
      deployer,
      wallet1,
      wallet2,
      wallet3,
      wallet4,
      wallet5,
      newAdministrator,
      clientV2,
    } = getWalletsAndClient(chain, accounts);

    setCollectionRoyalties(chain, accounts, "V2");

    // should fail since no mint pass
    let block = chain.mineBlock([clientV2.mintToken(wallet1.address)]);
    block.receipts[0].result
      .expectErr()
      .expectUint(ErrCode.ERR_MINT_PASS_LIMIT_REACHED);

    // wallet 1 try to add mint pass, should fail since only admin can
    block = chain.mineBlock([
      clientV2.setMintPass(wallet1.address, 5, wallet1.address),
    ]);
    block.receipts[0].result
      .expectErr()
      .expectUint(ErrCode.ERR_NOT_ADMINISTRATOR);

    // admin add mint pass for wallet 1
    block = chain.mineBlock([
      clientV2.setMintPass(wallet1.address, 1, administrator.address),
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    clientV2.getMintPassBalance(wallet1.address).result.expectUint(1);

    // wallet 1 can now mint
    block = chain.mineBlock([clientV2.mintToken(wallet1.address)]);
    block.receipts[0].result.expectOk().expectBool(true);
    block.receipts[0].events.expectSTXTransferEvent(
      25000000,
      wallet1.address,
      wallet2.address
    );
    block.receipts[0].events.expectSTXTransferEvent(
      20000000,
      wallet1.address,
      wallet3.address
    );
    block.receipts[0].events.expectSTXTransferEvent(
      10000000,
      wallet1.address,
      wallet4.address
    );
    block.receipts[0].events.expectSTXTransferEvent(
      5000000,
      wallet1.address,
      wallet5.address
    );
    block.receipts[0].events.expectNonFungibleTokenMintEvent(
      types.uint(5721),
      wallet1.address,
      `${deployer.address}.crashpunks-v2`,
      "crashpunks-v2"
    );

    // check that wallet 1 mint pass decreased to 0
    clientV2.getMintPassBalance(wallet1.address).result.expectUint(0);

    // check that wallet 1 owns 5721
    clientV2
      .getOwner(5721)
      .result.expectOk()
      .expectSome()
      .expectPrincipal(wallet1.address);

    // check that wallet 1 can't mint again
    block = chain.mineBlock([clientV2.mintToken(wallet1.address)]);
    block.receipts[0].result
      .expectErr()
      .expectUint(ErrCode.ERR_MINT_PASS_LIMIT_REACHED);

    // replenish 20 mint pass for wallet 1
    // test batch set mint pass at the same time
    block = chain.mineBlock([
      // clientV2.setMintPass(wallet1.address, 20, administrator.address),
      clientV2.batchSetMintPass(
        [
          { account: wallet1.address, limit: 20 },
          { account: wallet2.address, limit: 1 },
        ],
        administrator.address
      ),
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // mint 20
    block = chain.mineBlock([
      clientV2.batchMintToken(
        Array.from({ length: 20 }).map((k, index) => index),
        wallet1.address
      ),
    ]);

    block.receipts[0].result.expectOk().expectBool(true);

    for (let i = 5722; i < 5722 + 20; i++) {
      clientV2
        .getOwner(i)
        .result.expectOk()
        .expectSome()
        .expectPrincipal(wallet1.address);
    }

    // expect nft id 5722+21 to not exist
    clientV2
      .getOwner(5722 + 21)
      .result.expectOk()
      .expectNone();

    // expect last token id = 5722 + 19
    clientV2
      .getLastTokenId()
      .result.expectOk()
      .expectUint(5722 + 19);

    // make sure wallet2 can use its mint pass as well
    block = chain.mineBlock([clientV2.mintToken(wallet2.address)]);
    block.receipts[0].result.expectOk().expectBool(true);
  },
});

Clarinet.test({
  name: "CrashpunksV2 - test admin airdrop",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const {
      administrator,
      deployer,
      wallet1,
      wallet2,
      wallet3,
      newAdministrator,
      clientV2,
    } = getWalletsAndClient(chain, accounts);

    // non-admin cannot airdrop
    let block = chain.mineBlock([
      clientV2.adminMintAirdrop(wallet1.address, 100, wallet1.address),
    ]);
    block.receipts[0].result
      .expectErr()
      .expectUint(ErrCode.ERR_NOT_ADMINISTRATOR);

    // admin can airdrop
    block = chain.mineBlock([
      clientV2.adminMintAirdrop(wallet1.address, 100, administrator.address),
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // check owner of nft 100 is wallet 1
    clientV2
      .getOwner(100)
      .result.expectOk()
      .expectSome()
      .expectPrincipal(wallet1.address);
  },
});

Clarinet.test({
  name: "Ensure can freeze metadata",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const { administrator, wallet1, clientV2 } = getWalletsAndClient(
      chain,
      accounts
    );

    const firstUri =
      "ipfs://Qmad43sssgNbG9TpC6NfeiTi9X6f9vPYuzgW2S19BEi49m/{id}";
    const nextUri = "ipfs/QmdcBZnzSUwAKQdnVMKSkbVYoDD6DBkghPPUAwtVQjpwgq/{id}";
    clientV2
      .getTokenUri(0)
      .result.expectOk()
      .expectSome()
      .expectAscii(firstUri);

    // wallet 1 cant change token uri since not contract owner
    let block = chain.mineBlock([
      clientV2.setBaseUri(nextUri, wallet1.address),
    ]);
    block.receipts[0].result
      .expectErr()
      .expectUint(ErrCode.ERR_NOT_ADMINISTRATOR);

    // deployer can
    block = chain.mineBlock([
      clientV2.setBaseUri(nextUri, administrator.address),
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    clientV2.getTokenUri(0).result.expectOk().expectSome().expectAscii(nextUri);

    // wallet 1 cant freeze since not contract owner
    block = chain.mineBlock([clientV2.freezeMetadata(wallet1.address)]);
    block.receipts[0].result
      .expectErr()
      .expectUint(ErrCode.ERR_NOT_ADMINISTRATOR);

    // administrator can
    block = chain.mineBlock([clientV2.freezeMetadata(administrator.address)]);
    block.receipts[0].result.expectOk().expectBool(true);

    // deployer can't change back
    block = chain.mineBlock([
      clientV2.setBaseUri(firstUri, administrator.address),
    ]);
    block.receipts[0].result
      .expectErr()
      .expectUint(ErrCode.ERR_METADATA_FROZEN);

    clientV2.getTokenUri(0).result.expectOk().expectSome().expectAscii(nextUri);
  },
});

// Clarinet.test({
//   name: "CrashpunksV2 - playground",
//   async fn(chain: Chain, accounts: Map<string, Account>) {
//     const {
//       administrator,
//       deployer,
//       wallet1,
//       wallet2,
//       wallet3,
//       newAdministrator,
//       clientV2,
//     } = getWalletsAndClient(chain, accounts);

//     // mint v1 and upgrade
//     mintV1Token(chain, accounts);
//     chain.mineBlock([clientV2.upgradeV1ToV2(0, wallet1.address)]);

//     let block = chain.mineBlock([
//       Tx.contractCall(
//         "crashpunks-v2",
//         "get-v1-mint-counter",
//         [],
//         wallet1.address
//       ),
//     ]);
//     console.log(block);
//   },
// });
