import { WsJwtApprovalGuard } from "./ws-jwt-approval.guard";
import { WsException } from "@nestjs/websockets";
import { ExecutionContext } from "@nestjs/common";

describe("WsJwtApprovalGuard", () => {
  let guard: WsJwtApprovalGuard;
  let mockJwtService: any;
  let mockConfigService: any;
  let mockCoreClient: any;

  beforeEach(() => {
    mockJwtService = { verifyAsync: jest.fn() };
    mockConfigService = {
      getOrThrow: jest.fn().mockReturnValue("test-jwt-secret"),
    };
    mockCoreClient = { getUser: jest.fn() };
    guard = new WsJwtApprovalGuard(
      mockJwtService,
      mockConfigService,
      mockCoreClient,
    );
  });

  function createWsContext(authToken?: string): {
    context: ExecutionContext;
    client: any;
  } {
    const client = {
      handshake: {
        auth: authToken ? { token: authToken } : {},
        headers: {},
      },
      data: {} as any,
      disconnect: jest.fn(),
    };
    return {
      context: {
        switchToWs: () => ({ getClient: () => client }),
      } as any,
      client,
    };
  }

  it("allows when JWT valid and user approved", async () => {
    mockJwtService.verifyAsync.mockResolvedValue({
      sub: 1,
      email: "test@test.com",
    });
    mockCoreClient.getUser.mockResolvedValue({ approved: true });
    const { context, client } = createWsContext("valid-token");

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("disconnects and throws when user not approved", async () => {
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 1 });
    mockCoreClient.getUser.mockResolvedValue({ approved: false });
    const { context, client } = createWsContext("valid-token");

    await expect(guard.canActivate(context)).rejects.toThrow(WsException);
    expect(client.disconnect).toHaveBeenCalled();
  });

  it("disconnects and throws when user not found", async () => {
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 1 });
    mockCoreClient.getUser.mockResolvedValue(null);
    const { context, client } = createWsContext("valid-token");

    await expect(guard.canActivate(context)).rejects.toThrow(WsException);
    expect(client.disconnect).toHaveBeenCalled();
  });

  it("disconnects on invalid JWT", async () => {
    mockJwtService.verifyAsync.mockRejectedValue(
      new Error("invalid signature"),
    );
    const { context, client } = createWsContext("bad-token");

    await expect(guard.canActivate(context)).rejects.toThrow(WsException);
    expect(client.disconnect).toHaveBeenCalled();
  });
});
