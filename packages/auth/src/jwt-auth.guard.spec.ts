import { JwtAuthGuard } from "./jwt-auth.guard";
import { IS_PUBLIC_KEY } from "./public.decorator";
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";

describe("JwtAuthGuard", () => {
  let guard: JwtAuthGuard;
  let mockJwtService: any;
  let mockConfigService: any;
  let mockReflector: any;

  beforeEach(() => {
    mockJwtService = {
      verifyAsync: jest.fn(),
    };
    mockConfigService = {
      getOrThrow: jest.fn().mockReturnValue("test-jwt-secret"),
    };
    mockReflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };
    guard = new JwtAuthGuard(mockJwtService, mockConfigService, mockReflector);
  });

  function createMockContext(
    headers: Record<string, string> = {},
  ): ExecutionContext {
    const request = { headers, user: undefined as any };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  }

  it("allows request with valid Bearer JWT", async () => {
    const payload = { sub: 1, email: "test@test.com" };
    mockJwtService.verifyAsync.mockResolvedValue(payload);
    const context = createMockContext({
      authorization: "Bearer valid-token",
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockJwtService.verifyAsync).toHaveBeenCalledWith("valid-token", {
      secret: "test-jwt-secret",
    });
    const req = context.switchToHttp().getRequest();
    expect(req.user).toEqual(payload);
  });

  it("skips for @Public() routes", async () => {
    mockReflector.getAllAndOverride.mockReturnValue(true);
    const context = createMockContext();

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockJwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it("throws UnauthorizedException for missing Authorization header", async () => {
    const context = createMockContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("throws UnauthorizedException for non-Bearer scheme", async () => {
    const context = createMockContext({ authorization: "Basic abc123" });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("throws ForbiddenException for expired JWT", async () => {
    mockJwtService.verifyAsync.mockRejectedValue({ name: "TokenExpiredError" });
    const context = createMockContext({
      authorization: "Bearer expired-token",
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("throws ForbiddenException for invalid JWT", async () => {
    mockJwtService.verifyAsync.mockRejectedValue(
      new Error("invalid signature"),
    );
    const context = createMockContext({
      authorization: "Bearer bad-token",
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
