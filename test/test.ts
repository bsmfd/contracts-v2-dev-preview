// @ts-ignore
import { ethers, network } from "hardhat";
import { expect} from "chai";
import deployAdapter from "../scripts/connectAdapter";
import { CreditFacade, CreditFacade__factory, CreditManager, CreditManager__factory, DieselToken__factory, UniswapV2Adapter } from "../types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { DieselToken, TokenMock } from "@gearbox-protocol/sdk";
import { BigNumber } from "ethers";

describe("Gearbox", function () {

    let adapter: UniswapV2Adapter;
    let usdc: DieselToken;
    let weth: DieselToken;
    let deployer: SignerWithAddress;
    let facade: CreditFacade;
    let creditManager: CreditManager;
    let lp: DieselToken;

    const facadeAddress = "0xF2f670ECF9fFE399b1DE919E750363cC863fF251";
    const usdcAddress = "0x31EeB2d0F9B6fD8642914aB10F4dD473677D80df";
    const wethAddress = "0xd0A1E359811322d97991E03f863a0C30C2cF029C";
    const creditManagerAddress = "0x90017BA0dBb94B73D0A31fEae03B5A82B812a395";
    const uniUsdcWethAddress = "0x85B3b77f1fb13aCa9bA7f02db20758CE6a4170d6";

    before(async () => {
        await network.provider.request({
            method: "hardhat_reset",
            params: [
              {
                forking: {
                  jsonRpcUrl: "https://eth-kovan.alchemyapi.io/v2/evLmP_mz_QMKQRJUuGoe14WW1Oj42h3a",
                },
              },
            ],
        });
        
        const accounts = (await ethers.getSigners()) as Array<SignerWithAddress>;
        
        deployer = accounts[0];
        
        adapter = await deployAdapter();
        
        usdc = DieselToken__factory.connect(usdcAddress, deployer) as any;

        weth = DieselToken__factory.connect(wethAddress, deployer) as any;

        lp = DieselToken__factory.connect(uniUsdcWethAddress, deployer) as any;
        
        facade = CreditFacade__factory.connect(facadeAddress, deployer);

        creditManager = CreditManager__factory.connect(creditManagerAddress, deployer);

        await usdc.approve(creditManagerAddress, "0xffffffffffffffffffffffffff");

    });

    it("Should leverage USDC and then LP", async function () {

        const inAmount = BigNumber.from("590000000");

        await facade.openCreditAccount(inAmount, deployer.address, 200, 0);

        const acc = await creditManager.creditAccounts(deployer.address);

        const usdcBalance = await usdc.balanceOf(acc);

        expect(usdcBalance.eq(inAmount.mul(3)));

        await adapter.addLPWithSingleToken({
            amountIn: usdcBalance,
            amountAMin: 0,
            amountBMin: 0,
            path: [usdcAddress, wethAddress],
            deadline: 999999999999999
        });

        const lpBalance = await lp.balanceOf(acc);

        console.log("lp balance:  ", (await lp.balanceOf(acc)).toString());
        console.log("usdc balance:", (await usdc.balanceOf(acc)).toString());
        console.log("weth balance:", (await weth.balanceOf(acc)).toString());

    });

});