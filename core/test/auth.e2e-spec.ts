import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService, JwtModule } from "@nestjs/jwt";
import { ConfigModule } from "@nestjs/config";
import request from "supertest";
import cookieParser from "cookie-parser";
import * as bcrypt from "bcrypt";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { AuthGuard } from "../src/auth/guards/auth.guard";
import { RefreshGuard } from "../src/auth/guards/refresh.guard";
import { AuthDatabaseService } from "../src/auth-database";
import { NotificationService } from "../src/auth/notification.service";
import coreConfig from "../src/config/core.config";

// In-memory user store for testing
class MockAuthDatabaseService {
  private users: any[] = [];
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
    findMany: jest.fn(({ where }: any = {}) => {
      let result = [...this.users];
      if (where) {
        result = result.filter((u) => {
          return Object.entries(where).every(([k, v]) => u[k] === v);
        });
      }
      return result;
    }),
    create: jest.fn(({ data }: any) => {
      const user = {
        id: this.nextId++,
        ...data,
        role: data.role || "USER",
        refreshToken: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.users.push(user);
      return { ...user };
    }),
    update: jest.fn(({ where, data }: any) => {
      const user = where.email
        ? this.users.find((u) => u.email === where.email)
        : this.users.find((u) => u.id === where.id);
      if (user) Object.assign(user, data, { updatedAt: new Date() });
      return user ? { ...user } : null;
    }),
    delete: jest.fn(({ where }: any) => {
      const idx = where.email
        ? this.users.findIndex((u) => u.email === where.email)
        : this.users.findIndex((u) => u.id === where.id);
      if (idx >= 0) {
        const [deleted] = this.users.splice(idx, 1);
        return deleted;
      }
      return null;
    }),
  };

  isHealthy() {
    return true;
  }

  // reset for each test
  reset() {
    this.users = [];
    this.nextId = 1;
    Object.values(this.user).forEach((fn: any) => fn?.mockClear?.());
  }
}

// Stub logger that does nothing
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
};

describe("Auth E2E", () => {
  let app: INestApplication;
  let mockDb: MockAuthDatabaseService;

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
        {
          provide: NotificationService,
          useValue: {
            notifyRegistration: jest.fn(),
          },
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
  });

  beforeEach(() => {
    mockDb.reset();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("POST /auth/signup", () => {
    it("201 - creates user with valid data", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/signup")
        .send({ email: "user@test.com", password: "password123" })
        .expect(201);

      expect(res.body.message).toContain("Registration successful");
      expect(mockDb.user.create).toHaveBeenCalled();
      const createCall = mockDb.user.create.mock.calls[0][0];
      expect(createCall.data.email).toBe("user@test.com");
      expect(createCall.data.approved).toBe(false);
      // Password should be hashed, not stored as plaintext
      expect(createCall.data.password).not.toBe("password123");
    });

    it("400 - rejects invalid email", async () => {
      await request(app.getHttpServer())
        .post("/auth/signup")
        .send({ email: "not-an-email", password: "password123" })
        .expect(400);
    });

    it("400 - rejects short password", async () => {
      await request(app.getHttpServer())
        .post("/auth/signup")
        .send({ email: "user@test.com", password: "short" })
        .expect(400);
    });

    it("400 - rejects unknown fields (forbidNonWhitelisted)", async () => {
      await request(app.getHttpServer())
        .post("/auth/signup")
        .send({
          email: "user@test.com",
          password: "password123",
          admin: true,
        })
        .expect(400);
    });

    it("409 - rejects duplicate email", async () => {
      // Pre-populate user
      mockDb.user.findUnique.mockReturnValueOnce({
        id: 1,
        email: "existing@test.com",
      });

      await request(app.getHttpServer())
        .post("/auth/signup")
        .send({ email: "existing@test.com", password: "password123" })
        .expect(409);
    });
  });

  describe("POST /auth/login", () => {
    let hashedPassword: string;

    beforeEach(async () => {
      hashedPassword = await bcrypt.hash("password123", 4);
    });

    it("200 - returns accessToken and sets refresh cookie", async () => {
      mockDb.user.findUnique.mockReturnValueOnce({
        id: 1,
        email: "user@test.com",
        password: hashedPassword,
        approved: true,
      });

      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "user@test.com", password: "password123" })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      const cookies = res.headers["set-cookie"];
      expect(cookies).toBeDefined();
      const cookieStr = Array.isArray(cookies) ? cookies.join(";") : cookies;
      expect(cookieStr).toContain("refresh_token");
      expect(cookieStr).toContain("HttpOnly");
    });

    it("401 - rejects wrong password", async () => {
      mockDb.user.findUnique.mockReturnValueOnce({
        id: 1,
        email: "user@test.com",
        password: hashedPassword,
        approved: true,
      });

      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "user@test.com", password: "wrong-password" })
        .expect(401);
    });

    it("401 - rejects non-existent user", async () => {
      mockDb.user.findUnique.mockReturnValueOnce(null);

      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "ghost@test.com", password: "password123" })
        .expect(401);
    });

    it("403 - rejects unapproved user", async () => {
      mockDb.user.findUnique.mockReturnValueOnce({
        id: 1,
        email: "user@test.com",
        password: hashedPassword,
        approved: false,
      });

      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "user@test.com", password: "password123" })
        .expect(403);
    });
  });

  describe("POST /auth/refresh", () => {
    it("200 - issues new tokens with valid refresh cookie", async () => {
      const jwtService = app.get(JwtService);
      const refreshToken = await jwtService.signAsync(
        { sub: 1, email: "user@test.com" },
        { secret: process.env.JWT_REFRESH_SECRET, expiresIn: 3600 },
      );
      const hashedRefresh = await bcrypt.hash(refreshToken, 4);

      mockDb.user.findUnique.mockReturnValueOnce({
        id: 1,
        email: "user@test.com",
        refreshToken: hashedRefresh,
        approved: true,
      });

      const res = await request(app.getHttpServer())
        .post("/auth/refresh")
        .set("Cookie", `refresh_token=${refreshToken}`)
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
    });

    it("401 - rejects request without refresh cookie", async () => {
      await request(app.getHttpServer()).post("/auth/refresh").expect(401);
    });
  });

  describe("GET /auth/profile", () => {
    it("200 - returns profile for authenticated user", async () => {
      const jwtService = app.get(JwtService);
      const token = await jwtService.signAsync(
        { sub: 1, email: "user@test.com" },
        { secret: process.env.JWT_SECRET, expiresIn: 900 },
      );

      // For AuthGuard approval check
      mockDb.user.findUnique.mockReturnValueOnce({ approved: true });
      // For getProfile call
      mockDb.user.findUnique.mockReturnValueOnce({
        id: 1,
        email: "user@test.com",
        name: "Test User",
        role: "USER",
        approved: true,
        createdAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .get("/auth/profile")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.email).toBe("user@test.com");
    });

    it("401 - rejects without token", async () => {
      await request(app.getHttpServer()).get("/auth/profile").expect(401);
    });
  });

  describe("POST /auth/logout", () => {
    it("200 - clears refresh cookie", async () => {
      const jwtService = app.get(JwtService);
      const token = await jwtService.signAsync(
        { sub: 1, email: "user@test.com" },
        { secret: process.env.JWT_SECRET, expiresIn: 900 },
      );

      mockDb.user.findUnique.mockReturnValueOnce({ approved: true });

      const res = await request(app.getHttpServer())
        .post("/auth/logout")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.message).toBe("Logged out");
    });
  });

  describe("DELETE /auth/profile", () => {
    it("200 - deletes account", async () => {
      const jwtService = app.get(JwtService);
      const token = await jwtService.signAsync(
        { sub: 1, email: "user@test.com" },
        { secret: process.env.JWT_SECRET, expiresIn: 900 },
      );

      mockDb.user.findUnique.mockReturnValueOnce({ approved: true });

      const res = await request(app.getHttpServer())
        .delete("/auth/profile")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.message).toBe("Account deleted");
      expect(mockDb.user.delete).toHaveBeenCalled();
    });
  });
});
