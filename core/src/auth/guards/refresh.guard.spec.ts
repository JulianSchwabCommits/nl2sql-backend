import { RefreshGuard } from "./refresh.guard";
import { UnauthorizedException, ExecutionContext } from "@nestjs/common";

describe("RefreshGuard", () => {
  let guard: RefreshGuard;
  let mockJwtService: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockJwtService = { verifyAsync: jest.fn() };
    mockConfigService = {
      getOrThrow: jest.fn().mockReturnValue("test-refresh-secret"),
    };
    guard = new RefreshGuard(mockJwtService, mockConfigService);
  });

  function createContext(
    cookies: Record<string, string> = {},
  ): ExecutionContext {
    const request = { cookies };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as any;
  }

  it("allows request with valid refresh_token cookie", async () => {
    const payload = { sub: 1, email: "test@test.com" };
    mockJwtService.verifyAsync.mockResolvedValue(payload);
    const context = createContext({ refresh_token: "valid-refresh" });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    const req = context.switchToHttp().getRequest() as any;
    expect(req.user.sub).toBe(1);
    expect(req.user.refreshToken).toBe("valid-refresh");
  });

  it("throws UnauthorizedException when no cookie present", async () => {
    const context = createContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("throws UnauthorizedException for expired token", async () => {
    mockJwtService.verifyAsync.mockRejectedValue({
      name: "TokenExpiredError",
    });
    const context = createContext({ refresh_token: "expired-token" });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("throws UnauthorizedException for invalid token", async () => {
    mockJwtService.verifyAsync.mockRejectedValue(
      new Error("invalid signature"),
    );
    const context = createContext({ refresh_token: "bad-token" });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
