import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService, JwtModule } from "@nestjs/jwt";
import { ConfigModule } from "@nestjs/config";
import request from "supertest";
import cookieParser from "cookie-parser";
import * as bcrypt from "bcrypt";
import { AdminController } from "../src/admin/admin.controller";
import { AuthDatabaseService } from "../src/auth-database";
import coreConfig from "../src/config/core.config";

// In-memory user store
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
    findMany: jest.fn(({ where, select, orderBy }: any = {}) => {
      let result = [...this.users];
      if (where) {
        result = result.filter((u) =>
          Object.entries(where).every(([k, v]) => u[k] === v),
        );
      }
      if (select) {
        result = result.map((u) => {
          const r: any = {};
          for (const key of Object.keys(select)) {
            if (select[key]) r[key] = u[key];
          }
          return r;
        });
      }
      return result;
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

describe("Admin E2E", () => {
  let app: INestApplication;
  let mockDb: MockAuthDatabaseService;
  let jwtService: JwtService;
  let adminToken: string;

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
      controllers: [AdminController],
      providers: [
        {
          provide: AuthDatabaseService,
          useValue: mockDb,
        },
        {
          provide: "PinoLogger:AdminController",
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
    const hashedPassword = await bcrypt.hash("admin123", 4);
    mockDb.users.push({
      id: 1,
      email: "admin@test.com",
      password: hashedPassword,
      name: "Admin",
      role: "ADMIN",
      approved: true,
      refreshToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockDb.users.push({
      id: 2,
      email: "pending@test.com",
      password: await bcrypt.hash("user123", 4),
      name: "Pending User",
      role: "USER",
      approved: false,
      refreshToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    adminToken = await jwtService.signAsync(
      { sub: 1, email: "admin@test.com", role: "ADMIN" },
      { secret: process.env.JWT_SECRET, expiresIn: 3600 },
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("POST /admin/login", () => {
    it("200 - authenticates admin and sets cookie", async () => {
      const res = await request(app.getHttpServer())
        .post("/admin/login")
        .send({ email: "admin@test.com", password: "admin123" })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.email).toBe("admin@test.com");
      const cookies = res.headers["set-cookie"];
      const cookieStr = Array.isArray(cookies) ? cookies.join(";") : cookies;
      expect(cookieStr).toContain("admin_token");
    });

    it("401 - rejects non-admin user", async () => {
      await request(app.getHttpServer())
        .post("/admin/login")
        .send({ email: "pending@test.com", password: "user123" })
        .expect(401);
    });

    it("401 - rejects wrong password", async () => {
      await request(app.getHttpServer())
        .post("/admin/login")
        .send({ email: "admin@test.com", password: "wrong" })
        .expect(401);
    });
  });

  describe("POST /admin/logout", () => {
    it("200 - clears admin cookie", async () => {
      const res = await request(app.getHttpServer())
        .post("/admin/logout")
        .expect(200);

      expect(res.body.message).toBe("Logged out");
    });
  });

  describe("GET /admin/pending", () => {
    it("returns unapproved users for admin", async () => {
      const res = await request(app.getHttpServer())
        .get("/admin/pending")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it("403 - rejects without admin token", async () => {
      await request(app.getHttpServer()).get("/admin/pending").expect(403);
    });
  });

  describe("GET /admin/users", () => {
    it("returns all users for admin", async () => {
      const res = await request(app.getHttpServer())
        .get("/admin/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("POST /admin/approve", () => {
    it("approves a pending user", async () => {
      const res = await request(app.getHttpServer())
        .post("/admin/approve")
        .query({ email: "pending@test.com" })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.message).toContain("approved");
    });

    it("404 - rejects non-existent user", async () => {
      await request(app.getHttpServer())
        .post("/admin/approve")
        .query({ email: "ghost@test.com" })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe("POST /admin/reject", () => {
    it("rejects and deletes a user", async () => {
      const res = await request(app.getHttpServer())
        .post("/admin/reject")
        .query({ email: "pending@test.com" })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.message).toContain("rejected");
    });

    it("404 - rejects non-existent user", async () => {
      await request(app.getHttpServer())
        .post("/admin/reject")
        .query({ email: "ghost@test.com" })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe("DELETE /admin/users/:id", () => {
    it("deletes user by ID", async () => {
      const res = await request(app.getHttpServer())
        .delete("/admin/users/2")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.message).toContain("deleted");
    });

    it("404 - non-existent user", async () => {
      await request(app.getHttpServer())
        .delete("/admin/users/999")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe("PATCH /admin/users/:id/name", () => {
    it("updates user name", async () => {
      const res = await request(app.getHttpServer())
        .patch("/admin/users/2/name")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "New Name" })
        .expect(200);

      expect(res.body.message).toContain("name updated");
    });
  });

  describe("PATCH /admin/users/:id/role", () => {
    it("changes role to ADMIN", async () => {
      const res = await request(app.getHttpServer())
        .patch("/admin/users/2/role")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "ADMIN" })
        .expect(200);

      expect(res.body.message).toContain("role updated");
    });
  });

  describe("PATCH /admin/users/:id/password", () => {
    it("resets user password", async () => {
      const res = await request(app.getHttpServer())
        .patch("/admin/users/2/password")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ password: "newpassword123" })
        .expect(200);

      expect(res.body.message).toContain("password reset");
    });

    it("400 - rejects password < 8 chars", async () => {
      await request(app.getHttpServer())
        .patch("/admin/users/2/password")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ password: "short" })
        .expect(400);
    });
  });
});
