import { Controller, Request, Post, UseGuards, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './local-auth.guard';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    const user = await this.authService.register(dto.email, dto.password, dto.tenant_id);
    const { passwordEncrypted, ...result } = user;
    const tokenResponse = await this.authService.login(user);
    return {
      user: result,
      access_token: tokenResponse.access_token,
    };
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req) {
    const result = await this.authService.login(req.user);
    return {
      user: result.user,
      access_token: result.access_token,
    };
  }
}
