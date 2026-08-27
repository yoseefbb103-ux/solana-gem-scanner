## تحقق خارجي — 2026-08-27

المصدر: [Render Worker Deploys](https://dashboard.render.com/worker/srv-da86v08n74is739nh10g/deploys). خدمة `solana-gem-scanner-worker-ohio` التقطت commit `14c5c36` برسالة `fix: robustly bootstrap postgres scanner lock table` وظهرت حالتها `Building` وقت الالتقاط. النسخة السابقة `6011c63` كانت `Live`. يلزم إعادة فتح صفحة Deploys وLogs بعد اكتمال البناء للتحقق من تشغيل `dist/worker.js` ومن عدم ظهور خطأ `relation "scannerRunLocks" does not exist`.

المصدر: [GitHub scannerDb.ts](https://github.com/yoseefbb103-ux/solana-gem-scanner/blob/main/server/scannerDb.ts). أحدث commit ظاهر هو `14c5c36`، ما يثبت وصول الإصلاح إلى الفرع `main`.

## نتيجة تشغيل Worker بعد 14c5c36

أصبحت النسخة `14c5c36` في خدمة Worker Ohio بحالة `Live`، وبدأ الأمر `pnpm start:worker` وشغّل `NODE_ENV=production node dist/worker.js`. لكن السجلات أظهرت أن دورة `early discovery` تفشل عند `insert into "sourceHealthEvents"`، وأن `confirmed scan` يفشل عند قراءة `filterSettings`. هذا يعني أن المشكلة لم تعد جدول القفل فقط؛ مخطط قاعدة Render غير مكتمل أو لم تُطبّق عليه جداول التطبيق كاملة. يلزم تطبيق `pnpm db:push` فعلياً على قاعدة Render أو تنفيذ تهيئة مخطط آمنة قبل إعلان Worker جاهزاً.

## نتيجة bootstrap وقت التشغيل — 2026-08-27

Deploy commit `6cc083e`/`456960c` شغّل `scripts/ensure-db.mjs` بنجاح وظهر في السجل: `[DB Bootstrap] PostgreSQL schema is ready.`. بعد ذلك فشل الفحص الأول لأن PostgreSQL أبلغ عن غياب `sourceHealthEvents` أثناء الإدراج وغياب `filterSettings` أثناء القراءة للنطاق `public-dashboard`. كما ظهر أثناء `db:push` سؤال تفاعلي عن إنشاء أو إعادة تسمية `alertEvents` قبل اكتمال الأمر، لذلك لا يكفي الاعتماد على `db:push` التفاعلي لإثبات تهيئة آمنة وغير تفاعلية. لم تُحذف أي بيانات.
## نتيجة تشغيل Worker بعد إصلاح bootstrap الحتمي — 2026-08-27

أظهرت سجلات العملية الجديدة تشغيل `node scripts/ensure-db.mjs && NODE_ENV=production node dist/worker.js` ونجاح bootstrap برسالة `PostgreSQL schema is ready.`. بعد ذلك اكتملت دورة `early discovery` بـ 10 مرشحين، واكتملت دورة `confirmed scan` بـ 32 مرشحاً. ظهرت رسائل `ELIFECYCLE` ورسائل القفل بالعربية أثناء تبديل عمليات النشر المتداخلة القديمة، لذلك تُستكمل المراقبة للتأكد من استقرار العملية الحالية فقط.

## استقرار Worker بعد النشر — 2026-08-27 18:32

آخر الرسائل الظاهرة للعملية الحالية تؤكد نجاح `DB Bootstrap`، واكتمال `early discovery` عدة مرات، واكتمال `confirmed scan` بـ 32 مرشحاً. رسالة `يوجد فحص نشط بالفعل` ظهرت من عملية قديمة أثناء تبديل النشر، وهي سلوك القفل المتوقع وليست خطأ مخطط. لم يظهر في آخر السجل خطأ `sourceHealthEvents` أو `filterSettings`.

## Web UI المنشور — 2026-08-27

أعاد الرابط المنشور `https://solana-gem-scanner-ohio.onrender.com/` عنوان `ماسح إشارات سولانا` وواجهة عربية RTL، وظهرت عناصر تحديث يدوي وحفظ المرشحات والسياسة وحقول السيولة والحجم والعمر والمخاطرة. أعادت الصفحة HTTP 200 بحسب فتحها في المتصفح. تعذر التقاط القراءة التفصيلية في محاولة لاحقة بسبب إعادة جلسة المتصفح إلى صفحة فارغة، لذا يلزم إعادة الفتح مرة أخرى قبل الإغلاق النهائي.

## تحقق Web النهائي — 2026-08-27 18:33

أعاد الموقع المنشور واجهة عربية RTL مع بيانات حية من Worker: 32 نتيجة ظاهرة، 12 تقرير RugCheck متاح، متوسط فرصة 45.8، وصفر تحذيرات سحب سيولة حرجة حالياً. ظهر أفضل خمسة مرشحين، وقائمة Early-20S، وجدول سجل الأزواج مع آخر جلب عند 18:33. يظل التطبيق للقراءة فقط مع تحذير مالي واضح وعدم وجود اتصال بالمحفظة أو تنفيذ معاملات.

## Telegram في Worker — 2026-08-27 18:45

بعد حفظ متغيري Telegram في Worker، نجح Render في بناء ونشر العملية `dep-da88ajifngtc73bmm2b0` من commit `42a6491`. ظهرت عملية جديدة بالمعرّف `fr8lm` شغّلت `scripts/ensure-db.mjs` ونجح bootstrap، ثم بدأت دورة `early discovery`. قبل الإعادة كانت دورات `confirmed scan` تكتمل باستمرار، ولم تظهر أخطاء مخطط PostgreSQL في السجل الأخير. اختبار Telegram API المحلي أعاد `ok: true` للإرسال، كما أعاد `getMe` و`getChat` حالة نجاح.

## تحقق التشغيل بعد تفعيل Telegram — 2026-08-27 18:46

العملية الجديدة `fr8lm` في Worker Ohio شغّلت bootstrap ونجحت، ثم نفذت `early discovery` و`confirmed scan` بنجاح (28 و32 مرشحاً في الدورات الظاهرة). لم يظهر في السجل الأخير خطأ `Telegram HTTP` أو عبارة `تنبيهات تيليجرام غير مهيأة`. لا تُرسل رسالة إشارة إلا عند تحقق شرط Early Watch أو threshold أو confirmed alert؛ لذلك غياب سطر Telegram في السجل لا يعني فشلاً، خصوصاً أن الكود يسجل حالة الإرسال في `alertEvents` بدلاً من طباعتها.

## تحقق متغيرات Telegram بعد الحفظ — 2026-08-27

بعد إعادة نشر Worker، تعرض صفحة Environment في Render المتغيرين `TELEGRAM_BOT_TOKEN` و`TELEGRAM_CHAT_ID` كمتغيرين محفوظين في وضع القراءة، وتعرض قيمهما مخفية. لم تُستخدم أزرار إظهار أو نسخ القيم أثناء التحقق.

## استمرار العملية بعد Telegram — 2026-08-27 18:49

تُظهر سجلات Worker العملية `fr8lm` وهي مستمرة بعد تفعيل المتغيرات. نفذت bootstrap بنجاح، ثم أكملت `confirmed scan` عدة مرات و`early discovery` بشكل دوري. لم تظهر أخطاء مخطط PostgreSQL أو `Telegram HTTP` أو `تنبيهات تيليجرام غير مهيأة`. لا تزال سجلات Render لا تطبع نتيجة كل إرسال Telegram لأن الكود يحفظها في `alertEvents` دون logging؛ لذلك يلزم إثبات إرسال من حالة تنبيه حقيقية أو من قاعدة Render قبل checkpoint النهائي.

## النتيجة النهائية بعد إعادة إدخال Telegram — 2026-08-27 19:14–19:19

أعيد إدخال `TELEGRAM_BOT_TOKEN` و`TELEGRAM_CHAT_ID` في صفحة Environment الخاصة بعامل `solana-gem-scanner-worker-ohio`، ثم أطلق Render نشر النسخة `dep-da88oohsrm7s73ft8md0`. اكتمل البناء بنجاح، وظهرت رسالة `Your service is live`. تعرض صفحة Environment القيم المحفوظة في وضع القراءة، وتطابق قيمتها الصحيحة دون تضمينها في المستودع أو السجلات.

كانت رسائل `Telegram HTTP 401` عند 19:14–19:15 صادرة من العملية القديمة `nqbqk` أثناء تبديل النشر. بعد بدء العملية الجديدة `vr2jl` عند 19:14:25، استمر العامل في تنفيذ `early discovery` و`confirmed scan`، ثم ظهر في السجل عند 19:17:43 وعند 19:19:04 السطر `[Telegram] early_watch sent: تم إرسال تنبيه تيليجرام`. هذا يثبت إرسال تنبيه حقيقي من دورة Worker بعد التحديث، دون إدخال بيانات سوق مصطنعة ودون كشف الأسرار.

تشغيل `pnpm test` نجح بنتيجة 39 اختباراً ناجحاً واختبار واحد متروك عمداً، ونجح `pnpm check` و`pnpm build`. كما التُقطت صورة نهائية للواجهة المحلية، وظهرت لوحة عربية RTL مع التحذير المالي البارز، وحالة الرصد المبكر، وبطاقات النتائج، دون ربط محفظة أو تنفيذ تداول.

ظهر أثناء فتح الواجهة المحلية خطأ SSL لأن بيئة الاختبار المحلية ما زالت تحقن مضيف TiDB القديم `gateway06.us-east-1.prod.aws.tidbcloud.com:4000`، في حين أن Render يستخدم PostgreSQL المُدار. لا يمثل ذلك خللاً في خدمة Render النهائية، ولذلك لم يُغيّر كود الإنتاج أو يُستبدل إعداد قاعدة البيانات المدارة. يلزم فقط استخدام `DATABASE_URL` PostgreSQL الصحيح عند تشغيل نسخة محلية تريد قراءة البيانات الحية.
## محاولة إصلاح Web Oregon القديمة — 2026-08-27 19:38–19:40

تم تعديل Build Command في خدمة `solana-gem-scanner` القديمة ليصبح `npm install -g pnpm@10.4.1 && pnpm install --frozen-lockfile && pnpm build`، وأصبح البناء ناجحاً وبدأت الخدمة فعلياً بالأمر `pnpm start` الذي ينفذ `node scripts/ensure-db.mjs && NODE_ENV=production node dist/_core/index.js`. بذلك انتهى سبب `dist/index.js` وأزيلت خطوة `db:push` التفاعلية.

لم تكتمل صحة خدمة Oregon القديمة لأن bootstrap يفشل في الوصول إلى PostgreSQL الموجود في Ohio بعنوان داخلي `ENOTFOUND`. هذا قيد بنية المنطقة وليس خطأ في مخرجات البناء أو أمر التشغيل. خدمة `solana-gem-scanner-ohio` هي الخدمة المعتمدة المتصلة بالقاعدة في Ohio، وتبقى خدمة Oregon القديمة محفوظة دون حذف بناءً على قرار المستخدم.

لم يُجرَ تدوير لبيانات Telegram بناءً على طلب المستخدم، لذلك يظل خطر انكشاف الاعتماد موثقاً ولا يُوصف بأنه مُعالج أمنياً، رغم إثبات نجاح الإرسال من Worker قبل ذلك.
