// Mock for .prisma/auth-client used in tests
export class PrismaClient {
  $connect() {
    return Promise.resolve();
  }
  $disconnect() {
    return Promise.resolve();
  }
  $queryRaw() {
    return Promise.resolve([{ "?column?": 1 }]);
  }
}
