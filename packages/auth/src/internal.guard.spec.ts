import { InternalGuard } from "./internal.guard";
import { UnauthorizedException, ExecutionContext } from "@nestjs/common";

describe("InternalGuard", () => {
  let guard: InternalGuard;
  let mockConfigService: any;

  beforeEach(() => {
    mockConfigService = {
      getOrThrow: jest.fn().mockReturnValue("super-secret-key"),
    };
    guard = new InternalGuard(mockConfigService);
  });

  function createMockContext(
    headers: Record<string, string> = {},
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    } as any;
  }

  it("allows matching x-internal-key", () => {
    const context = createMockContext({
      "x-internal-key": "super-secret-key",
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it("throws UnauthorizedException for wrong key", () => {
    const context = createMockContext({ "x-internal-key": "wrong-key" });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("throws UnauthorizedException for missing header", () => {
    const context = createMockContext({});

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
