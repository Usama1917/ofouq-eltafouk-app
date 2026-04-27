# قاعدة بيانات محلية مؤقتة + نقلها للسحابة

المشروع هنا مبني بالفعل على `PostgreSQL + Drizzle`، وده ممتاز لأنه يخلّي النقل للسحابة سهل جدًا:

1. تشغيل PostgreSQL محليًا عبر Docker.
2. إدارة السكيمة من خلال Drizzle.
3. نقل البيانات للسحابة بـ `pg_dump` و `pg_restore`.

## أفضل Setup عملي

- Local Dev (مؤقت): `postgres:16-alpine` عبر Docker
- Cloud (مناسب جدًا): Neon أو Supabase أو Railway أو AWS RDS (Postgres)
- الكود ثابت: فقط تغيّر `DATABASE_URL`

## 1) تشغيل قاعدة البيانات المحلية

```bash
pnpm db:local:up
```

الأمر ده يعمل تلقائيًا:

- تشغيل Postgres من `docker-compose.local-db.yml`
- انتظار جاهزية الداتابيز
- تحديث `artifacts/api-server/.env` بقيمة `DATABASE_URL`
- تطبيق schema بـ Drizzle
- Seed لحسابات الديمو

متغيرات اختيارية:

```bash
LOCAL_DB_PORT=5432
LOCAL_DB_NAME=ofouq_eltafouk
LOCAL_DB_USER=postgres
LOCAL_DB_PASSWORD=postgres
API_PORT=8080
```

## 2) إيقاف القاعدة المحلية

```bash
pnpm db:local:down
```

إيقاف مع حذف البيانات (reset كامل):

```bash
REMOVE_VOLUMES=true pnpm db:local:down
```

## 3) تشغيل التطبيق

```bash
pnpm start:local
```

## 4) رفع البيانات إلى قاعدة سحابية

```bash
CLOUD_DATABASE_URL='postgresql://...sslmode=require' pnpm db:cloud:sync
```

افتراضيًا: `schema-and-data` (يستبدل الجداول الموجودة في Cloud).

وضع أكثر أمانًا لنقل البيانات فقط:

```bash
SYNC_MODE=data-only CLOUD_DATABASE_URL='postgresql://...sslmode=require' pnpm db:cloud:sync
```

## ملاحظات مهمة

- وضع `schema-and-data` قد يكون مدمّرًا للبيانات الموجودة على Cloud.
- للإنتاج يفضّل تدفق migrations versioned بدل الاعتماد فقط على `push`.
- لا تحفظ روابط Cloud DB السرّية داخل Git.
