# نتائج التحقق من الواجهات الخارجية

## فحص الأمان

توفر RugCheck واجهة عامة لفحص تقرير التوكن الكامل عبر `GET /v1/tokens/{id}/report` وملخصه عبر `GET /v1/tokens/{id}/report/summary`. ستستخدم النسخة العملية الملخص عند توافره لتقليل الحمل، وستسجل حالة الفشل بدلاً من افتراض أن التوكن آمن.

توفر GoPlus مساراً مستقلاً لفحص أمان توكنات سولانا، لكنه مذكور كواجهة Beta ضمن الوثائق. لذلك سيبقى تكاملاً اختيارياً عبر متغير بيئة إن احتاج الوصول رمزاً، ولا يستخدم كدليل وحيد على السلامة.

يوثق GoPlus مسار `GET https://api.gopluslabs.io/api/v1/solana/token_security` ومعلمة `contract_addresses` المطلوبة ورأس تفويض Bearer. لذلك لا يمكن تشغيله على نحو موثوق دون رمز وصول يقدمه المستخدم؛ يبقى RugCheck الخيار الافتراضي بلا رمز، ويستخدم GoPlus فقط حين يُضبط السر.

تستعمل تنبيهات تيليجرام واجهة Bot API وخطوة `sendMessage` من الخادم فقط. يلزمها رمز البوت ووجهة `chat_id`، ولا يوضع أي منهما في الواجهة أو مستودع GitHub.

## قرار التنفيذ

يكون RugCheck هو مصدر الأمان الأساسي للنسخة الأولى. تتعامل طبقة الفحص مع مصدر الأمان بوصفه قابلاً للفشل: يعرض التطبيق "بيانات أمان غير متاحة" عند التعذر، ويستمر في جمع السوق وتخزين اللقطة دون منح علامة أمان إيجابية.

## المصادر

- https://api.rugcheck.xyz/swagger/index.html
- https://docs.gopluslabs.io/reference/api-overview
- https://docs.gopluslabs.io/reference/solanatokensecurityusingget
- https://core.telegram.org/bots/api#sendmessage
