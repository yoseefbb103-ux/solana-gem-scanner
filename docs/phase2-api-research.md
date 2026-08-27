# بحث واجهات المرحلة الثانية

تاريخ التحقق: 27 أغسطس 2026.

## GoPlus Token Security for Solana

توثق GoPlus واجهة `GET https://api.gopluslabs.io/api/v1/solana/token_security` على أنها واجهة تجريبية لفحص مخاطر توكنات سولانا. تتطلب معامل الاستعلام `contract_addresses` ورأس مصادقة بصيغة `Authorization: Bearer <token>`، وتوثق حالات HTTP `200` و`401` و`403` و`404`. [1]

تظهر صفحة تفاصيل الاستجابة حقولاً خاصة بمعلومات التوكن والمخاطر، لكنها لم تعرض نموذج JSON ثابتاً أثناء التحقق. لذلك سيتعامل التكامل مع الاستجابة بوصفها بيانات غير موثوقة البنية: لن يعتمد إلا حقولاً موجودة فعلاً ومتحققاً من نوعها، وأي نقص أو خطأ سيظهر كـ«غير متاح» ولا كاجتياز أمني. [2]

## قرار التنفيذ

سيُفعَّل GoPlus فقط عند وجود `GOPLUS_ACCESS_TOKEN` في بيئة الخادم. لا توجد قيمة افتراضية ولا يُرسل أي رمز إلى المتصفح. وسيبقى RugCheck المصدر الأساسي؛ أما اختلاف المصدرين فسيُسجل تحذيراً مستقلاً بدل اختيار نتيجة إيجابية بينهما.

## Solana RPC وToken-2022

توثق Solana طريقة RPC `getTokenLargestAccounts` على أنها تعيد **أكبر 20 حساب توكن** لعنوان mint واحد، لا هويات المحافظ النهائية ولا سبب امتلاكها للتوكن. لذلك سيعامل الفحص هذه الحسابات كمدخل محدود لتحليل التركز، ولن يدّعي تحديد «مالك» كل حساب من تلك النتيجة وحدها. [3]

يوثق امتداد `Transfer Hook` في برنامج Token-2022 إمكانية تشغيل منطق تعليمات مخصص عند كل تحويل، بما في ذلك قوائم السماح أو الحظر ورسوم مخصصة. لذلك وجود الامتداد ليس دليلاً على احتيال، لكنه سبب كافٍ لتحذير مراجعة مستقل عن صلاحيات mint/freeze التقليدية. [4]

ستعتمد المرحلة الثانية RPC علنياً للقراءة فقط، بمهلة قصيرة وحد أقصى صغير للطلبات، وعلى المرشحين ضمن `deepScanLimit` فقط. ستفصل الواجهة بين «غير متاح» و«لا توجد إشارة مرصودة»؛ ففشل RPC أو محدودية سجل المعاملات لن يتحول إلى نتيجة آمنة.

## تحقق تاريخ التمويل المفهرس عبر Helius

توثق Helius واجهة Enhanced Transactions (القديمة) بعنوان `GET /v0/addresses/{address}/transactions` لاسترجاع تاريخ معاملات عنوان سولانا محلل وقابل للتصفح، مع حدود slot أو block-time، واتجاه ترتيب تصاعدي أو تنازلي، ومعاملات pagination. يتيح ذلك الوصول إلى أقدم تحويل SOL مرئي ضمن تاريخ المزود بدلاً من افتراض أن آخر سجل RPC هو أول تمويل. [5]

يتطلب Helius مفتاح API يُنشأ من لوحة المستخدم، ويوصي صراحةً بوضعه في متغير بيئة الخادم `HELIUS_API_KEY` وعدم تضمينه في الشفرة أو واجهة العميل. [6] التكامل البرمجي موجود اختيارياً لكنه غير مهيأ بمفتاح في هذه الجلسة. عند وجود المفتاح يستخدم التطبيق الاستعلام المفهرس بترتيب تصاعدي ومعامل `token-accounts=all`، ولا يظهر المفتاح في الواجهة أو المستودع.

## مسار Helius الاختياري ومسار المصادر العامة

سيستخدم التطبيق Helius اختيارياً عند وجود `HELIUS_API_KEY` على الخادم فقط. يفضل حينها نقطة Helius RPC ويستدعي سجل Enhanced Transactions المفهرس لأكبر خمسة حائزين عند تحليل مصدر التمويل. عند غياب المفتاح يعود إلى نقاط RPC عامة للقراءة فقط ضمن حدود ثابتة. تحفظ النتائج في `fundingEvidenceStatus`: `overlap_observed` لتداخل مرصود، و`no_overlap_indexed_window` لعدم رصد ضمن نافذة Helius المفهرسة، و`no_overlap_public_window` لعدم رصد ضمن نافذة RPC العامة المحدودة، و`unavailable` لتعذر مصدر. لا تمثل أي حالة عدم رصد نفياً مطلقاً أو براءة للعنوان.

تؤكد وثائق Solana أن برنامج Token-2022 يضيف امتدادات إلى قدرات برنامج SPL Token التقليدي، وأن مستودعه الرسمي يتضمن امتدادات منها `transfer_hook` و`transfer_fee` و`default_account_state` و`pausable` و`permanent_delegate`. لذلك سيظهر كل امتداد يتاح من استجابة RPC كمعلومة مراجعة محددة، لا كحكم احتيال تلقائي. [7] [8]

يعرّف المصدر الرسمي لواجهة Token-2022 المعرّف `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`، ويورد معرّف برنامج SPL Token التقليدي `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`. سيقارن التطبيق حقل owner في حساب mint بهذين المعرّفين صراحةً، ولا يصنّف أي برنامج آخر على أنه Token-2022. [9]

تحققنا من أن PublicNode يعرض نقطة Solana Mainnet عامة على `https://solana-rpc.publicnode.com` دون مفتاح، وأن طلب `getHealth` أعاد `ok` في بيئة الاختبار. ستستخدم كمسار احتياطي عند 429 أو تعذر نقطة Solana العامة الافتراضية، مع بقاء كل طلب محدوداً ومُسلسلاً. [10]

تحذر وثائق Solana أن نقاط RPC العامة مقيدة المعدل وأن حدودها قابلة للتغير، كما تنص على أنها ليست مخصصة لتطبيقات الإنتاج عالية الحركة. لذلك لا يشكل مصدر احتياطي عام ضمان توافر؛ يبقى قاطع التقييد وحالة «غير متاح» جزءاً من تصميم الأمان. [11]

توثق Pocket Network نقطة Solana RPC عامة مجانية على `https://solana.api.pocket.network` من دون مفتاح API وبحدود استخدام منصف. ستُختبر هذه النقطة قبل اعتمادها مساراً احتياطياً ثالثاً؛ ولا يغير وجودها قيد الاستدلال: انقطاع أي نقطة أو تقييدها يبقي الدليل غير متاح. [12]

## المراجع

[1] [GoPlus — Solana Token Security API](https://docs.gopluslabs.io/reference/solanatokensecurityusingget)

[2] [GoPlus — Solana Response Detail](https://docs.gopluslabs.io/reference/response-detail-1)

[3] [Solana — getTokenLargestAccounts](https://solana.com/docs/rpc/http/gettokenlargestaccounts)

[4] [Solana — Token-2022 Transfer Hook](https://solana.com/docs/tokens/extensions/transfer-hook)

[5] [Helius — Get Enhanced Transactions By Address](https://www.helius.dev/docs/api-reference/enhanced-transactions/gettransactionsbyaddress)

[6] [Helius — Authentication and Secret Management](https://www.helius.dev/docs/api-reference/authentication)

[7] [Solana — Tokens and Token Extensions](https://solana.com/docs/tokens)

[8] [Token-2022 — Extensions Source](https://github.com/solana-program/token-2022/blob/main/program/src/extension/mod.rs)

[9] [Token-2022 — Official Program IDs](https://github.com/solana-program/token-2022/blob/main/interface/src/lib.rs)

[10] [PublicNode — Solana RPC Gateway](https://solana.publicnode.com/)

[11] [Solana — Clusters and Public RPC Endpoints](https://solana.com/docs/references/clusters)

[12] [Pocket Network — Solana Public RPC](https://api.pocket.network/chains/solana)
