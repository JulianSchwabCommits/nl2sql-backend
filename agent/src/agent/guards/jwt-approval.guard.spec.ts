import { JwtApprovalGuard } from "./jwt-approval.guard";
import { ForbiddenException, ExecutionContext } from "@nestjs/common";

describe("JwtApprovalGuard", () => {
  let guard: JwtApprovalGuard;
  let mockJwtService: any;
  let mockConfigService: any;
  let mockReflector: any;
  let mockCoreClient: any;

  beforeEach(() => {
    mockJwtService = { verifyAsync: jest.fn() };
    mockConfigService = {
      getOrThrow: jest.fn().mockReturnValue("test-jwt-secret"),
    };
    mockReflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };
    mockCoreClient = { getUser: jest.fn() };
    guard = new JwtApprovalGuard(
      mockJwtService,
      mockConfigService,
      mockReflector,
      mockCoreClient,
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

  it("allows request when JWT is valid and user is approved", async () => {
    mockJwtService.verifyAsync.mockResolvedValue({
      sub: 1,
      email: "test@test.com",
    });
    mockCoreClient.getUser.mockResolvedValue({ approved: true });
    const context = createContext({ authorization: "Bearer valid" });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockCoreClient.getUser).toHaveBeenCalledWith(1);
  });

  it("rejects when user is not approved", async () => {
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 1 });
    mockCoreClient.getUser.mockResolvedValue({ approved: false });
    const context = createContext({ authorization: "Bearer valid" });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("rejects when user does not exist", async () => {
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 1 });
    mockCoreClient.getUser.mockResolvedValue(null);
    const context = createContext({ authorization: "Bearer valid" });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("rejects when core service is unavailable", async () => {
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 1 });
    mockCoreClient.getUser.mockRejectedValue(new Error("Network error"));
    const context = createContext({ authorization: "Bearer valid" });

    await expect(guard.canActivate(context)).rejects.toThrow();
  });
});
