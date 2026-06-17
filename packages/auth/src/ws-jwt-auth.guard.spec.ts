import { WsJwtAuthGuard } from "./ws-jwt-auth.guard";
import { WsException } from "@nestjs/websockets";
import { ExecutionContext } from "@nestjs/common";

describe("WsJwtAuthGuard", () => {
  let guard: WsJwtAuthGuard;
  let mockJwtService: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockJwtService = {
      verifyAsync: jest.fn(),
    };
    mockConfigService = {
      getOrThrow: jest.fn().mockReturnValue("test-jwt-secret"),
    };
    guard = new WsJwtAuthGuard(mockJwtService, mockConfigService);
  });

  function createMockWsContext(
    authToken?: string,
    authHeader?: string,
  ): { context: ExecutionContext; client: any } {
    const client = {
      handshake: {
        auth: authToken ? { token: authToken } : {},
        headers: authHeader ? { authorization: authHeader } : {},
      },
      data: {} as any,
      disconnect: jest.fn(),
    };
    const context = {
      switchToWs: () => ({ getClient: () => client }),
    } as any;
    return { context, client };
  }

  it("allows valid token from handshake.auth.token", async () => {
    const payload = { sub: 1, email: "test@test.com" };
    mockJwtService.verifyAsync.mockResolvedValue(payload);
    const { context, client } = createMockWsContext("valid-token");

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(client.data.user).toEqual(payload);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("allows valid token from Authorization header", async () => {
    const payload = { sub: 2, email: "user@test.com" };
    mockJwtService.verifyAsync.mockResolvedValue(payload);
    const { context, client } = createMockWsContext(
      undefined,
      "Bearer header-token",
    );

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(client.data.user).toEqual(payload);
  });

  it("disconnects client and throws WsException when no token", async () => {
    const { context, client } = createMockWsContext();

    await expect(guard.canActivate(context)).rejects.toThrow(WsException);
    expect(client.disconnect).toHaveBeenCalled();
  });

  it("disconnects client on invalid token", async () => {
    mockJwtService.verifyAsync.mockRejectedValue(
      new Error("invalid signature"),
    );
    const { context, client } = createMockWsContext("bad-token");

    await expect(guard.canActivate(context)).rejects.toThrow(WsException);
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('throws WsException with "Token expired" for expired tokens', async () => {
    mockJwtService.verifyAsync.mockRejectedValue({
      name: "TokenExpiredError",
    });
    const { context, client } = createMockWsContext("expired-token");

    await expect(guard.canActivate(context)).rejects.toThrow("Token expired");
    expect(client.disconnect).toHaveBeenCalled();
  });
});
