import {
  Inject,
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as bcrypt from 'bcrypt';
import coreConfig from '../config/core.config';
import { AuthDatabaseService } from '../auth-database';
import { RegisterDto, LoginDto } from './dto';
import { NotificationService } from './notification.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: AuthDatabaseService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly notification: NotificationService,
    @Inject(coreConfig.KEY)
    private readonly cfg: ConfigType<typeof coreConfig>,
    @InjectPinoLogger(AuthService.name) private readonly logger: PinoLogger,
  ) {}

  async signup(dto: RegisterDto) {
    const existing = await this.db.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      this.logger.warn(
        { event: 'auth.signup.rejected', email: dto.email },
        'signup rejected: email already registered',
      );
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, this.cfg.bcryptRounds);

    await this.db.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        approved: false,
      },
    });

    this.logger.info(
      { event: 'auth.signup', email: dto.email, name: dto.name },
      'user signed up (pending approval)',
    );

    this.notification.notifyRegistration(dto.name || dto.email);

    return {
      message:
        'Registration successful. Your account is pending approval by an administrator.',
    };
  }

  async login(dto: LoginDto) {
    const user = await this.db.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      this.logger.warn(
        { event: 'auth.login.failure', email: dto.email, reason: 'user_not_found' },
        'login failed: user not found',
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);

    if (!passwordValid) {
      this.logger.warn(
        {
          event: 'auth.login.failure',
          userId: user.id,
          email: user.email,
          reason: 'invalid_password',
        },
        'login failed: invalid password',
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.approved) {
      this.logger.warn(
        {
          event: 'auth.login.denied',
          userId: user.id,
          email: user.email,
          reason: 'not_approved',
        },
        'login denied: account pending approval',
      );
      throw new ForbiddenException(
        'Your account is pending approval. Please wait for admin confirmation.',
      );
    }

    const tokens = await this.generateTokens(user.id, user.email);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    this.logger.info(
      { event: 'auth.login.success', userId: user.id, email: user.email },
      'user login succeeded',
    );

    return tokens;
  }

  async refresh(userId: number, refreshToken: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Access denied');
    }

    if (!user.approved) {
      throw new ForbiddenException('Account not approved');
    }

    const tokenValid = await bcrypt.compare(refreshToken, user.refreshToken);

    if (!tokenValid) {
      throw new UnauthorizedException('Access denied');
    }

    const tokens = await this.generateTokens(user.id, user.email);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: number) {
    await this.db.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    this.logger.info({ event: 'auth.logout', userId }, 'user logout');
  }

  async getProfile(userId: number) {
    return this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        approved: true,
        createdAt: true,
      },
    });
  }

  async deleteProfile(userId: number) {
    await this.db.user.delete({ where: { id: userId } });
    this.logger.info(
      { event: 'auth.account.deleted', userId },
      'user account deleted',
    );
  }

  private async generateTokens(userId: number, email: string) {
    const payload = { sub: userId, email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: this.cfg.accessTokenTtlSec,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.cfg.refreshTokenTtlSec,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(userId: number, refreshToken: string) {
    const hash = await bcrypt.hash(refreshToken, this.cfg.bcryptRounds);
    await this.db.user.update({
      where: { id: userId },
      data: { refreshToken: hash },
    });
  }
}
