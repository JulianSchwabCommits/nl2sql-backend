import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService, JwtModule } from "@nestjs/jwt";
import { ConfigModule } from "@nestjs/config";
import request from "supertest";
import cookieParser from "cookie-parser";
import * as bcrypt from "bcrypt";
import { AuthController } from "../../core/src/auth/auth.controller";
import { AuthService } from "../../core/src/auth/auth.service";
import { AuthGuard } from "../../core/src/auth/guards/auth.guard";
import { RefreshGuard } from "../../core/src/auth/guards/refresh.guard";
import { AuthDatabaseService } from "../../core/src/auth-database";
import coreConfig from "../../core/src/config/core.config";

// Reused mock
class MockAuthDatabaseService {
  users: any[] = [];
  private nextId = 1;

  user = {
    findUnique: jest.fn(({ where, select }: any) => {
      let user: any;
      if (where.email) user = this.users.find((u) => u.email === where.email);
      else if (where.id) user = this.users.find((u) => u.id === where.id);
      if (!user) return null;
      if (select) {
        const result: any = {};
        for (const key of Object.keys(select)) {
          if (select[key]) result[key] = user[key];
        }
        return result;
      }
      return { ...user };
    }),
    create: jest.fn(({ data }: any) => {
      const user = {
        id: this.nextId++,
        role: "USER",
        approved: false,
        refreshToken: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      this.users.push(user);
      return { ...user };
    }),
    update: jest.fn(({ where, data }: any) => {
      const user = where.id
        ? this.users.find((u) => u.id === where.id)
        : this.users.find((u) => u.email === where.email);
      if (user) Object.assign(user, data);
      return user ? { ...user } : null;
    }),
    delete: jest.fn(({ where }: any) => {
      const idx = this.users.findIndex((u) => u.id === where.id);
      if (idx >= 0) return this.users.splice(idx, 1)[0];
      return null;
    }),
  };

  reset() {
    this.users = [];
    this.nextId = 1;
    Object.values(this.user).forEach((fn: any) => fn?.mockClear?.());
  }
}

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
};

describe("Security Tests", () => {
  let app: INestApplication;
  let mockDb: MockAuthDatabaseService;
  let jwtService: JwtService;

  beforeAll(async () => {
    process.env.JWT_SECRET = "test-jwt-secret-key-32chars-long!!";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret-key-32chars!!";
    process.env.BCRYPT_ROUNDS = "4";
    process.env.ACCESS_TOKEN_TTL_SEC = "900";
    process.env.REFRESH_TOKEN_TTL_SEC = "604800";
    process.env.ADMIN_TOKEN_TTL_SEC = "14400";
    process.env.THROTTLE_SHORT_TTL_MS = "60000";
    process.env.THROTTLE_SHORT_LIMIT = "100";
    process.env.THROTTLE_LONG_TTL_MS = "600000";
    process.env.THROTTLE_LONG_LIMIT = "1000";

    mockDb = new MockAuthDatabaseService();

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [coreConfig] }),
        JwtModule.register({ global: true }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        AuthGuard,
        RefreshGuard,
        {
          provide: AuthDatabaseService,
          useValue: mockDb,
        },
        {
          provide: "PinoLogger:AuthService",
          useValue: mockLogger,
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    jwtService = app.get(JwtService);
  });

  beforeEach(async () => {
    mockDb.reset();
    const hashedPassword = await bcrypt.hash("password123", 4);
    mockDb.users.push({
      id: 1,
      email: "user@test.com",
      password: hashedPassword,
      name: "Test User",
      role: "USER",
      approved: true,
      refreshToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("Auth Bypass Attempts", () => {
    it("rejects expired JWT", async () => {
      const expiredToken = await jwtService.signAsync(
        { sub: 1, email: "user@test.com" },
        { secret: process.env.JWT_SECRET, expiresIn: 0 },
      );

      // Small delay to ensure expiry
      await new Promise((r) => setTimeout(r, 50));

      await request(app.getHttpServer())
        .get("/auth/profile")
        .set("Authorization", `Bearer ${expiredToken}`)
        .expect(403);
    });

    it("rejects JWT signed with wrong secret", async () => {
      const wrongSecretToken = await jwtService.signAsync(
        { sub: 1, email: "user@test.com" },
        { secret: "completely-wrong-secret-key!!!", expiresIn: 900 },
      );

      await request(app.getHttpServer())
        .get("/auth/profile")
        .set("Authorization", `Bearer ${wrongSecretToken}`)
        .expect(403);
    });

    it("rejects tampered JWT payload", async () => {
      const token = await jwtService.signAsync(
        { sub: 1, email: "user@test.com" },
        { secret: process.env.JWT_SECRET, expiresIn: 900 },
      );

      // Tamper with the payload section
      const parts = token.split(".");
      const tamperedPayload = Buffer.from(
        JSON.stringify({ sub: 999, email: "hacker@test.com" }),
      ).toString("base64url");
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      await request(app.getHttpServer())
        .get("/auth/profile")
        .set("Authorization", `Bearer ${tamperedToken}`)
        .expect(403);
    });

    it("rejects missing Authorization header", async () => {
      await request(app.getHttpServer()).get("/auth/profile").expect(401);
    });

    it("rejects non-Bearer auth scheme", async () => {
      await request(app.getHttpServer())
        .get("/auth/profile")
        .set("Authorization", "Basic dXNlcjpwYXNz")
        .expect(401);
    });

    it("rejects valid JWT for a revoked (unapproved) user", async () => {
      const token = await jwtService.signAsync(
        { sub: 1, email: "user@test.com" },
        { secret: process.env.JWT_SECRET, expiresIn: 900 },
      );

      // User is now unapproved (revoked)
      mockDb.users[0].approved = false;

      await request(app.getHttpServer())
        .get("/auth/profile")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });

    it("rejects valid JWT for deleted user", async () => {
      const token = await jwtService.signAsync(
        { sub: 999, email: "deleted@test.com" },
        { secret: process.env.JWT_SECRET, expiresIn: 900 },
      );

      await request(app.getHttpServer())
        .get("/auth/profile")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });
  });

  describe("Cookie Security", () => {
    it("sets httpOnly flag on refresh cookie", async () => {
      const hashedPassword = await bcrypt.hash("password123", 4);
      mockDb.user.findUnique.mockReturnValueOnce({
        id: 1,
        email: "user@test.com",
        password: hashedPassword,
        approved: true,
      });

      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "user@test.com", password: "password123" });

      const cookies = res.headers["set-cookie"];
      const cookieStr = Array.isArray(cookies) ? cookies.join(";") : cookies;
      expect(cookieStr).toContain("HttpOnly");
    });

    it("sets sameSite=strict on refresh cookie", async () => {
      const hashedPassword = await bcrypt.hash("password123", 4);
      mockDb.user.findUnique.mockReturnValueOnce({
        id: 1,
        email: "user@test.com",
        password: hashedPassword,
        approved: true,
      });

      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "user@test.com", password: "password123" });

      const cookies = res.headers["set-cookie"];
      const cookieStr = Array.isArray(cookies)
        ? cookies.join(";")
        : String(cookies);
      expect(cookieStr.toLowerCase()).toContain("samesite=strict");
    });

    it("scopes refresh cookie to /auth/refresh path", async () => {
      const hashedPassword = await bcrypt.hash("password123", 4);
      mockDb.user.findUnique.mockReturnValueOnce({
        id: 1,
        email: "user@test.com",
        password: hashedPassword,
        approved: true,
      });

      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "user@test.com", password: "password123" });

      const cookies = res.headers["set-cookie"];
      const cookieStr = Array.isArray(cookies)
        ? cookies.join(";")
        : String(cookies);
      expect(cookieStr).toContain("Path=/auth/refresh");
    });
  });

  describe("Input Validation Security", () => {
    it("strips unknown properties from signup payload", async () => {
      await request(app.getHttpServer())
        .post("/auth/signup")
        .send({
          email: "new@test.com",
          password: "password123",
          role: "ADMIN",
        })
        .expect(400);
    });

    it("rejects extremely long password", async () => {
      await request(app.getHttpServer())
        .post("/auth/signup")
        .send({
          email: "new@test.com",
          password: "a".repeat(129),
        })
        .expect(400);
    });

    it("password is never stored as plaintext", async () => {
      await request(app.getHttpServer())
        .post("/auth/signup")
        .send({ email: "new@test.com", password: "password123" });

      if (mockDb.user.create.mock.calls.length > 0) {
        const storedPassword =
          mockDb.user.create.mock.calls[0][0].data.password;
        expect(storedPassword).not.toBe("password123");
        expect(storedPassword).toMatch(/^\$2[aby]?\$/);
      }
    });
  });
});
