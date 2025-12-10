import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AppLogger } from './common/logger/app.logger';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useLogger(['log', 'error', 'warn', 'debug', 'verbose']);
  const logger = new AppLogger();
  app.use(cookieParser());
  app.useLogger(logger);
  // app.enableCors({
  //   origin: ['http://localhost:5173', 'https://team-soft-ware-fk6s.vercel.app'],
  //   credentials: true, //cookie uchun majburiy
  // });

  const allowedOrigins = [
    'http://localhost:5173',
    'https://team-soft-ware-dslj.vercel.app',
  ];

  app.use((req, res, next) => {
    const origin = req.headers.origin as string | undefined;

    if (origin && allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }

    res.header('Access-Control-Allow-Credentials', 'true');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    );
    res.header(
      'Access-Control-Allow-Methods',
      'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    );

    if (req.method === 'OPTIONS') {
      // preflight so‘rovni shu yerning o‘zida yakunlaymiz
      return res.sendStatus(204);
    }

    next();
  });

  // 2) Nest’ning CORS’ini ham yoqamiz, lekin origin dinamik (kelgan origin)
  app.enableCors({
    origin: true,
    credentials: true,
  });

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);

  logger.log(`Server running at http://localhost:${port}`);
}

bootstrap();
