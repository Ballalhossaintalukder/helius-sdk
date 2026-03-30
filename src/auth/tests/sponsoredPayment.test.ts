import {
  requestSponsoredTransaction,
  signAndSubmitSponsoredTx,
  paySponsoredIntent,
} from "../sponsoredPayment";
import { authRequest } from "../utils";
import { checkUsdcBalance } from "../checkBalances";
import { loadKeypair } from "../loadKeypair";
import { getAddress } from "../getAddress";

jest.mock("../utils");
jest.mock("../checkBalances");
jest.mock("../loadKeypair");
jest.mock("../getAddress");

// Mock @solana/kit for signAndSubmitSponsoredTx
// Use implementation functions (not mockReturnValue) so they survive jest.resetAllMocks()
jest.mock("@solana/kit", () => ({
  createSolanaRpc: jest.fn().mockImplementation(() => ({})),
  createSolanaRpcSubscriptions: jest.fn().mockImplementation(() => ({})),
  sendAndConfirmTransactionFactory: jest
    .fn()
    .mockImplementation(() => jest.fn().mockResolvedValue(undefined)),
  createKeyPairSignerFromBytes: jest.fn().mockImplementation(async () => ({
    keyPair: { publicKey: new Uint8Array(32), privateKey: new Uint8Array(64) },
  })),
  getSignatureFromTransaction: jest
    .fn()
    .mockImplementation(() => "tx-signed-sig"),
  signTransaction: jest
    .fn()
    .mockImplementation(async () => ({ mock: "signed-tx" })),
  getTransactionDecoder: jest.fn().mockImplementation(() => ({
    decode: () => ({ mock: "decoded-tx" }),
  })),
  getBase64Encoder: jest.fn().mockImplementation(() => ({
    encode: () => new Uint8Array([1, 2, 3]),
  })),
}));

const mockAuthRequest = authRequest as jest.MockedFunction<typeof authRequest>;
const mockCheckUsdcBalance = checkUsdcBalance as jest.MockedFunction<
  typeof checkUsdcBalance
>;
const mockLoadKeypair = loadKeypair as jest.MockedFunction<typeof loadKeypair>;
const mockGetAddress = getAddress as jest.MockedFunction<typeof getAddress>;

const MOCK_INTENT = {
  id: "pi_test",
  status: "pending" as const,
  destinationWallet: "Treasury111",
  amount: 4900,
  solanaPayUrl: "solana:...",
  expiresAt: "2026-01-01T00:00:00Z",
  createdAt: "2025-12-01T00:00:00Z",
  priceId: "price_dev_monthly",
  refId: "ref-1",
};

const MOCK_BUILD_RESPONSE = {
  transaction: "base64-encoded-tx",
  paymentIntentId: "pi_test",
  lastValidBlockHeight: 12345678,
};

describe("requestSponsoredTransaction", () => {
  beforeEach(() => jest.clearAllMocks());

  it("POSTs userWalletAddress to build-sponsored-tx endpoint", async () => {
    mockAuthRequest.mockResolvedValue(MOCK_BUILD_RESPONSE);

    const result = await requestSponsoredTransaction(
      "jwt-123",
      MOCK_INTENT,
      "WalletAddress111",
      "test-agent"
    );

    expect(mockAuthRequest).toHaveBeenCalledWith(
      "/checkout/pi_test/build-sponsored-tx",
      {
        method: "POST",
        headers: { Authorization: "Bearer jwt-123" },
        body: JSON.stringify({ userWalletAddress: "WalletAddress111" }),
      },
      "test-agent"
    );
    expect(result).toEqual(MOCK_BUILD_RESPONSE);
  });

  it("uses intent.id in the endpoint path", async () => {
    mockAuthRequest.mockResolvedValue(MOCK_BUILD_RESPONSE);

    await requestSponsoredTransaction(
      "jwt",
      { ...MOCK_INTENT, id: "pi_custom" },
      "Wallet111"
    );

    expect(mockAuthRequest).toHaveBeenCalledWith(
      "/checkout/pi_custom/build-sponsored-tx",
      expect.any(Object),
      undefined
    );
  });
});

describe("signAndSubmitSponsoredTx", () => {
  beforeEach(() => jest.clearAllMocks());

  it("decodes, signs, and submits the transaction", async () => {
    const {
      getBase64Encoder,
      getTransactionDecoder,
      signTransaction,
      sendAndConfirmTransactionFactory,
      getSignatureFromTransaction,
    } = require("@solana/kit");

    const result = await signAndSubmitSponsoredTx(
      new Uint8Array(64),
      "base64-tx",
      12345678n
    );

    expect(getBase64Encoder).toHaveBeenCalled();
    expect(getTransactionDecoder).toHaveBeenCalled();
    expect(signTransaction).toHaveBeenCalled();
    expect(sendAndConfirmTransactionFactory).toHaveBeenCalled();
    expect(getSignatureFromTransaction).toHaveBeenCalled();
    expect(result).toBe("tx-signed-sig");
  });
});

describe("paySponsoredIntent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadKeypair.mockReturnValue({
      publicKey: new Uint8Array(32),
      secretKey: new Uint8Array(64),
    });
    mockGetAddress.mockResolvedValue("WalletAddress111");
    mockCheckUsdcBalance.mockResolvedValue(50_000_000n);
    mockAuthRequest.mockResolvedValue(MOCK_BUILD_RESPONSE);
  });

  it("checks USDC balance and requests backend-built tx", async () => {
    const result = await paySponsoredIntent(
      new Uint8Array(64),
      MOCK_INTENT,
      "jwt-123",
      "test-agent"
    );

    expect(mockCheckUsdcBalance).toHaveBeenCalledWith("WalletAddress111");
    expect(mockAuthRequest).toHaveBeenCalledWith(
      "/checkout/pi_test/build-sponsored-tx",
      {
        method: "POST",
        headers: { Authorization: "Bearer jwt-123" },
        body: JSON.stringify({ userWalletAddress: "WalletAddress111" }),
      },
      "test-agent"
    );
    expect(result).toBe("tx-signed-sig");
  });

  it("throws on insufficient USDC", async () => {
    mockCheckUsdcBalance.mockResolvedValue(1_000_000n);

    await expect(
      paySponsoredIntent(new Uint8Array(64), MOCK_INTENT, "jwt")
    ).rejects.toThrow("Insufficient USDC");
  });

  it("does not check SOL balance", async () => {
    const { checkSolBalance } = require("../checkBalances");

    await paySponsoredIntent(new Uint8Array(64), MOCK_INTENT, "jwt");

    expect(checkSolBalance).not.toHaveBeenCalled();
  });
});
