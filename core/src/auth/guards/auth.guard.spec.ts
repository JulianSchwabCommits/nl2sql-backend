import { AuthGuard } from "./auth.guard";
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";

describe("Core AuthGuard", () => {
  let guard: AuthGuard;
  let mockJwtService: any;
  let mockConfigService: any;
  let mockReflector: any;
  let mockDb: any;

  beforeEach(() => {
    mockJwtService = { verifyAsync: jest.fn() };
    mockConfigService = {
      getOrThrow: jest.fn().mockReturnValue("test-jwt-secret"),
    };
    mockReflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };
    mockDb = {
      user: {
        findUnique: jest.fn(),
      },
    };
    guard = new AuthGuard(
      mockJwtService,
      mockConfigService,
      mockReflector,
      mockDb,
    );
  });

  function createContext(
    headers: Record<string, string> = {},
  ): ExecutionContext {
    const request: Record<string, any> = { headers };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  }

  it("allows request for valid JWT with approved user", async () => {
    const payload = { sub: 1, email: "user@test.com" };
    mockJwtService.verifyAsync.mockResolvedValue(payload);
    mockDb.user.findUnique.mockResolvedValue({ approved: true });
    const context = createContext({ authorization: "Bearer good-token" });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(context.switchToHttp().getRequest().user).toEqual(payload);
  });

  it("skips check for @Public() routes", async () => {
    mockReflector.getAllAndOverride.mockReturnValue(true);
    const context = createContext();

    expect(await guard.canActivate(context)).toBe(true);
    expect(mockJwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it("throws UnauthorizedException for missing token", async () => {
    const context = createContext({});
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("throws ForbiddenException for expired JWT", async () => {
    mockJwtService.verifyAsync.mockRejectedValue({
      name: "TokenExpiredError",
    });
    const context = createContext({ authorization: "Bearer expired" });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("throws ForbiddenException for unapproved user", async () => {
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 1 });
    mockDb.user.findUnique.mockResolvedValue({ approved: false });
    const context = createContext({ authorization: "Bearer valid" });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("throws ForbiddenException for deleted user (null)", async () => {
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 999 });
    mockDb.user.findUnique.mockResolvedValue(null);
    const context = createContext({ authorization: "Bearer valid" });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("throws ForbiddenException for invalid JWT signature", async () => {
    mockJwtService.verifyAsync.mockRejectedValue(
      new Error("invalid signature"),
    );
    const context = createContext({ authorization: "Bearer bad" });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
