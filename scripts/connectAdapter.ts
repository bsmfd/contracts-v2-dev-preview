// @ts-ignore
import { ethers, network } from "hardhat";
// @ts-ignore
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/root-with-address";
import { Logger } from "tslog";
import * as dotenv from "dotenv";
import {
  AddressProvider__factory,
  CreditConfigurator__factory,
  ICreditManager__factory,
  PriceOracle__factory,
  UniswapV2Adapter,
  ZeroPriceFeed,
  LpOracle
} from "../types";
import { deploy, waitForTransaction } from "../utils/transaction";
import { UNISWAP_V2_ROUTER } from "@gearbox-protocol/sdk";

const log = new Logger();
const CONFIGURATOR = "0x19301B8e700925E850C945a28256b6A6FDe5904C";
const CREDIT_MANAGER = "0x90017BA0dBb94B73D0A31fEae03B5A82B812a395";
const ORIGINAL_CONTRACT = UNISWAP_V2_ROUTER;

interface LPToken {
  address: string;
  liquidationThreshold: number;
}

const LP_TOKENS: Array<LPToken> = [{
  address: "0xe7282e08d2E7e56aA0e075b47a75C1f058428aEC",
  liquidationThreshold: 1,
}];

/// This script deploys and connects new adapter to desired CreditManager
async function deployAdapter() {
  dotenv.config({ path: ".env.kovan" });

  // Gets active accounts
  const accounts = (await ethers.getSigners()) as Array<SignerWithAddress>;
  const deployer = accounts[0];
  log.debug(`Deployer account: ${deployer.address}`);

  const chainId = await deployer.getChainId();
  if (chainId !== 1337) throw new Error("Switch to Kovan fork network");

  // Impersonates CONFIGURATOR ROLE on Kovan to be able to make changes on system level
  log.debug("Impersonate CONFIGURATOR account");
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [CONFIGURATOR],
  });

  const configurator = (await ethers.provider.getSigner(
    CONFIGURATOR
  )) as unknown as SignerWithAddress;

  // Gets address provider and priceOracle
  const addressProvider = AddressProvider__factory.connect(
    process.env.REACT_APP_ADDRESS_PROVIDER || "",
    deployer
  );
  
  const priceOracle = PriceOracle__factory.connect(
    await addressProvider.getPriceOracle(),
    configurator
  );


  // Gets creditConfigurator instance for particular creditManager
  const cm = ICreditManager__factory.connect(CREDIT_MANAGER, deployer);
  const creditConfigurator = CreditConfigurator__factory.connect(
    await cm.creditConfigurator(),
    configurator
  );

  // Deploys new PriceFeeds if needed
  for (let lpToken of LP_TOKENS) {
    const kovanParams = ["0xe7282e08d2E7e56aA0e075b47a75C1f058428aEC", "0x64EaC61A2DFda2c3Fa04eED49AA33D021AeC8838", "0x0000000000000000000000000000000000000000", "0x31EeB2d0F9B6fD8642914aB10F4dD473677D80df", "0xd0A1E359811322d97991E03f863a0C30C2cF029C", "0xd0A1E359811322d97991E03f863a0C30C2cF029C"];
    // Please, change here to your PriceFeed which supports LP tokens
    const priceFeed = await deploy<LpOracle>("LpOracle", log, ...kovanParams);


    // Adds lpToken to priceOracle with LP priceFeed
    await waitForTransaction(
      priceOracle.addPriceFeed(lpToken.address, priceFeed.address)
    );

    // Adds lpToken to creditConfigurator
    await waitForTransaction(
      creditConfigurator.addTokenToAllowedList(lpToken.address)
    );


    // Sets Liquidation Threshold to lpToken in CreditManager
    await waitForTransaction(
      creditConfigurator.setLiquidationThreshold(
        lpToken.address,
        lpToken.liquidationThreshold
      )
    );
  }
  // Deploys adapter
  log.debug("Deploying new adapter");
  const newAdapter = (
    await deploy<UniswapV2Adapter>(
      "UniswapV2Adapter",
      log,
      CREDIT_MANAGER,
      ORIGINAL_CONTRACT
    )
  ).address;


  await waitForTransaction(
    creditConfigurator.forbidContract(ORIGINAL_CONTRACT)
  );
  // It allows contract. It would add pair contract <-> adapter
  // if it wasn't added before or replace existing one
  log.debug("Allowing contract on Credit manager");
  await waitForTransaction(
    creditConfigurator.allowContract(ORIGINAL_CONTRACT, newAdapter)
  );
}

deployAdapter();
