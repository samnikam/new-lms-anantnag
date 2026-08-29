import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: false });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());

  // Render/Vercel terminate TLS upstream; without this Express sees plain HTTP
  // and refuses to set Secure cookies.
  app.set('trust proxy', 1);

  // CORS_ORIGIN is a comma-separated allowlist. Vercel preview deployments get
  // a fresh subdomain per commit, so *.vercel.app previews are matched by suffix
  // when ALLOW_VERCEL_PREVIEWS is set.
  const allowlist = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // curl, server-to-server, health checks
      if (allowlist.includes(origin)) return callback(null, true);
      if (process.env.ALLOW_VERCEL_PREVIEWS === 'true' && /^https:\/\/[\w-]+\.vercel\.app$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed by CORS.`), false);
    },
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('Hybrid Learning LMS Portal API')
    .setDescription('GeM Bid GEM/2026/B/7822845 — PWD J&K, R&B Division Pahalgam')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0'); // container platforms require binding all interfaces
  new Logger('Bootstrap').log(`API on http://localhost:${port}/api — docs at /api/docs`);
}

bootstrap();
